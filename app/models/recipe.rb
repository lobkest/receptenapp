class Recipe < ApplicationRecord
  include DeletionRequestable

  MAX_INGREDIENTS = 50
  MAX_STEPS = 30
  # Hard cap, checked before any row is built. Above this the request gets a 422 at once.
  MAX_NESTED_ROWS = 100
  MAX_DESCRIPTION_LENGTH = 5000
  # Same as the most the recipe page lets you scale to.
  MAX_SERVINGS = 50
  MAX_TAGS = 10

  # index_errors: errors read "steps[2].body", where 2 is the place in the request.
  has_many :steps, -> { order(:position) }, dependent: :destroy, inverse_of: :recipe,
    index_errors: :nested_attributes_order
  has_many :recipe_ingredients, -> { order(:id) }, dependent: :destroy, inverse_of: :recipe,
    index_errors: :nested_attributes_order

  has_many :recipe_tags, dependent: :destroy
  has_many :tags, through: :recipe_tags

  # The database deletes versions and variations together with the recipe (on_delete: :cascade).
  has_many :versions, class_name: "RecipeVersion", dependent: nil
  has_many :variations, -> { order(:position, :id) }, class_name: "RecipeVariation",
    inverse_of: :recipe, dependent: nil, index_errors: :nested_attributes_order
  # Without the ones whose deletion was requested: what the recipe page shows.
  has_many :visible_variations, -> { visible.order(:position, :id) }, class_name: "RecipeVariation"

  accepts_nested_attributes_for :steps, allow_destroy: true, limit: MAX_NESTED_ROWS
  accepts_nested_attributes_for :recipe_ingredients, allow_destroy: true, limit: MAX_NESTED_ROWS
  # Only new variations (the "+ Variatie toevoegen" section of the recipe form). Existing
  # ones are edited through their own endpoint, with their own lock_version.
  accepts_nested_attributes_for :variations, limit: RecipeVariation::MAX_PER_RECIPE

  scope :with_details, -> { includes(:tags, :steps, recipe_ingredients: :ingredient, visible_variations: RecipeVariation::DETAILS) }

  # Recipes that have ALL of the given tags. One subquery: take the recipe_tags rows whose
  # tag is one of the names, group them per recipe, and keep the recipes with as many
  # rows as there are names. A recipe with 1 of 2 tags has 1 row and drops out.
  scope :tagged_with_all, ->(names) {
    names = names.map { |name| Tag.normalize_value_for(:name, name.to_s) }.compact_blank.uniq
    next all if names.empty?

    matching = RecipeTag.joins(:tag).where(tags: { name: names })
      .group(:recipe_id).having("COUNT(*) = ?", names.size).select(:recipe_id)
    where(id: matching)
  }

  before_validation :number_steps

  validates :title, presence: true, length: { maximum: 150 }
  validates :description, length: { maximum: MAX_DESCRIPTION_LENGTH }
  validates :servings, numericality: { only_integer: true, greater_than: 0, less_than_or_equal_to: MAX_SERVINGS }
  validate :row_counts
  validate :tag_names_allowed, if: -> { @tag_names }

  # A recipe from before versions existed: keep its old state before the first change.
  # prepend: before link_tags, which already writes the new tags to the database.
  before_save :record_original_version, if: -> { persisted? && !versions.exists? }, prepend: true

  # Tags are linked in the same transaction as the recipe, and only once it is valid.
  before_save :link_tags, if: -> { @tag_names }
  before_save :touch_for_locking, if: :persisted?

  after_save :record_version, unless: :restoring?
  after_save :forget_submitted_lists

  # Remembers each step's place in the request, so positions follow the submitted order.
  def steps_attributes=(attributes)
    @steps_submitted = true
    attributes = attributes.to_h if attributes.respond_to?(:permitted?)
    attributes = attributes.values if attributes.is_a?(Hash) && !attributes.key?("id") && !attributes.key?(:id)

    super(Array.wrap(attributes).each_with_index.map { |step, index| step.to_h.merge("request_order" => index) })
  end

  def recipe_ingredients_attributes=(attributes)
    @recipe_ingredients_submitted = true
    super
  end

  # A variation saved together with the recipe is part of the recipe's own version.
  def variations_attributes=(attributes)
    super
    variations.each { |variation| variation.skip_recipe_version = true if variation.new_record? }
  end

  # tag_names: ["Vega", "snel"]. Replaces all tags of the recipe. Normalized like Tag#name,
  # empty names and doubles left out. Without tag_names in a request, tags stay as they are.
  def tag_names=(names)
    @tag_names = Array.wrap(names).map { |name| Tag.normalize_value_for(:name, name.to_s) }.compact_blank.uniq
  end

  def tag_names
    @tag_names || tags.map(&:name)
  end

  # Puts an older version back: title, description, servings, tags, ingredients, steps
  # and variations. Ingredient rows are replaced by new ones, in the order of the snapshot.
  # That also deletes the variations' removals (on_delete: :cascade), so the variations are
  # rebuilt afterwards, with each removal linked again by ingredient name.
  # This is a change like any other, so it makes a new version too ("Teruggezet naar ...").
  def restore_version!(version)
    snapshot = version.snapshot
    # A version from before variations existed says nothing about them: keep the current ones.
    variations_snapshot = snapshot["variations"] || RecipeVersion.snapshot_of(self)["variations"]

    transaction do
      @restoring = true
      assign_attributes(snapshot.slice("title", "description", "servings"))
      self.tag_names = snapshot["tag_names"]

      # Not through *_attributes=: an old version may have no ingredients or steps, and
      # that minimum only applies to what a person submits.
      recipe_ingredients.each(&:mark_for_destruction)
      snapshot["ingredients"].each { |row| recipe_ingredients.build(row) }
      steps.each(&:mark_for_destruction)
      snapshot["steps"].each.with_index(1) { |step, position| steps.build(body: step["body"], position: position) }

      save!
      restore_variations!(variations_snapshot)
      RecipeVersion.record!(self, note: "Teruggezet naar de versie van #{version.label}")
    ensure
      @restoring = false
    end
  end

  private
    def restoring?
      @restoring
    end

    # Variations that still exist are updated in place (same id, deletion request kept);
    # deleted ones come back; ones made after the version go.
    def restore_variations!(list)
      row_ids = recipe_ingredients.reload.to_h { |row| [ row.ingredient_name, row.id ] }
      current = variations.reload.index_by(&:id)
      RecipeVariation.where(recipe_id: id).where.not(id: list.map { |data| data["id"] }).delete_all

      list.each do |data|
        variation = current[data["id"]] || variations.build
        variation.skip_recipe_version = true
        variation.update!(name: data["name"], notes: data["notes"], position: data["position"],
          removed_ingredient_ids: data["removed"].filter_map { |name| row_ids[name] },
          added_ingredients: data["added"],
          added_tag_names: data["tags_added"], removed_tag_names: data["tags_removed"])
      end
      variations.reset
    end
    # Optimistic locking only checks lock_version when the recipes row itself is updated.
    # A change to only an ingredient or a step would skip that, so every save touches the row.
    def touch_for_locking
      self.updated_at = Time.current
    end

    def record_original_version
      RecipeVersion.record!(self, note: "Oorspronkelijke versie")
    end

    def record_version
      RecipeVersion.record!(self)
    end

    # Positions are always 1..n, decided here. Steps in the request come first, in request
    # order; steps the request did not mention follow in their old order.
    def number_steps
      return unless new_record? || @steps_submitted

      kept = steps.reject(&:marked_for_destruction?)
      ordered = kept.each_with_index.sort_by { |step, index| step.request_order ? [ 0, step.request_order ] : [ 1, index ] }
      ordered.each_with_index { |(step, _), index| step.position = index + 1 }
    end

    def forget_submitted_lists
      @steps_submitted = @recipe_ingredients_submitted = false
      @tag_names = nil
      association(:steps).target.each { |step| step.request_order = nil }
    end

    # The same rules as Tag#name, checked here so the errors land on the recipe ("tag_names")
    # before any tag is created.
    def tag_names_allowed
      errors.add(:tag_names, :too_many_tags, count: MAX_TAGS) if @tag_names.size > MAX_TAGS

      @tag_names.each do |name|
        errors.add(:tag_names, :tag_too_long, name: name, count: Tag::MAX_NAME_LENGTH) if name.length > Tag::MAX_NAME_LENGTH
        errors.add(:tag_names, :tag_with_comma, name: name) if name.include?(",")
      end
    end

    # Existing tags are reused; new ones created (see Tag.named). Variations that added a
    # tag the recipe now has, or took off one it no longer has, lose that tag change.
    def link_tags
      self.tags = @tag_names.map { |name| Tag.named(name) }
      forget_outdated_variation_tag_changes if persisted?
    end

    def forget_outdated_variation_tag_changes
      changes = VariationTagChange.joins(:recipe_variation).where(recipe_variations: { recipe_id: id })
      changes.kind_add.where(tag_id: tag_ids)
        .or(changes.kind_remove.where.not(tag_id: tag_ids))
        .delete_all
    end

    # New recipes need at least one ingredient and one step. Older recipes have neither,
    # so on update the minimum only applies to a list the request actually sends.
    def row_counts
      check_row_count(:recipe_ingredients, maximum: MAX_INGREDIENTS, required: new_record? || @recipe_ingredients_submitted)
      check_row_count(:steps, maximum: MAX_STEPS, required: new_record? || @steps_submitted)
    end

    def check_row_count(association, maximum:, required:)
      count = public_send(association).reject(&:marked_for_destruction?).size

      if required && count.zero?
        errors.add(association, :blank)
      elsif count > maximum
        errors.add(association, :too_many, count: maximum)
      end
    end
end
