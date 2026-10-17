class Recipe < ApplicationRecord
  include DeletionRequestable
  include TagNames

  MAX_INGREDIENTS = 50
  MAX_STEPS = 30
  # Hard cap, checked before any row is built. Above this the request gets a 422 at once.
  MAX_NESTED_ROWS = 100
  MAX_DESCRIPTION_LENGTH = 5000
  # Same as the most the recipe page lets you scale to.
  MAX_SERVINGS = 50
  MAX_TAGS = 10
  # The recipes without a category, in a filter (the frontend says "Overig").
  NO_CATEGORY_KEY = "overig"

  # index_errors: errors read "steps[2].body", where 2 is the place in the request.
  has_many :steps, -> { order(:position) }, dependent: :destroy, inverse_of: :recipe,
    index_errors: :nested_attributes_order
  has_many :recipe_ingredients, -> { order(:id) }, dependent: :destroy, inverse_of: :recipe,
    index_errors: :nested_attributes_order

  has_many :recipe_tags, dependent: :destroy
  has_many :tags, through: :recipe_tags

  # Optional: without a category the recipe is shown under "Overig". Set it by name with
  # category_name= (like tag_names=).
  belongs_to :category, optional: true

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

  scope :with_details, -> {
    includes(:tags, :category, :steps,
      recipe_ingredients: [ { ingredient: [ :nevo_food, :ingredient_traits ] }, { alternatives: { ingredient: [ :nevo_food, :ingredient_traits ] } } ],
      visible_variations: RecipeVariation::DETAILS)
  }

  # Recipes that have ALL of the given tags. One subquery: take the recipe_tags rows whose
  # tag is one of the names, group them per recipe, and keep the recipes with as many
  # rows as there are names. A recipe with 1 of 2 tags has 1 row and drops out.
  scope :tagged_with_all, ->(names) {
    names = normalize_tag_names(names)
    next all if names.empty?

    matching = RecipeTag.joins(:tag).where(tags: { name: names })
      .group(:recipe_id).having("COUNT(*) = ?", names.size).select(:recipe_id)
    where(id: matching)
  }

  # ?category=3, or ?category=overig for the recipes without one; blank is all of them.
  # An id that is not a number finds nothing.
  scope :in_category, ->(key) {
    next all if key.blank?
    next where(category_id: nil) if key.to_s == NO_CATEGORY_KEY

    where(category_id: Integer(key.to_s, exception: false) || -1)
  }

  before_validation :number_steps

  validates :title, presence: true, length: { maximum: 150 }
  validates :description, length: { maximum: MAX_DESCRIPTION_LENGTH }
  validates :servings, numericality: { only_integer: true, greater_than: 0, less_than_or_equal_to: MAX_SERVINGS }
  validate :row_counts
  validate :tag_names_allowed, if: -> { @tag_names }
  validate :category_name_allowed, if: -> { @category_name.present? }

  # A recipe from before versions existed: keep its old state before the first change.
  # prepend: before link_tags, which already writes the new tags to the database.
  before_save :record_original_version, if: -> { persisted? && !versions.exists? }, prepend: true

  # Tags are linked in the same transaction as the recipe, and only once it is valid.
  before_save :link_tags, if: -> { @tag_names }
  before_save :link_category, unless: -> { @category_name.nil? }
  before_save :touch_for_locking, if: :persisted?

  after_save :record_version, unless: :restoring?
  after_save :forget_submitted_lists

  # The visible recipes that have ALL of these tags (the filter of /api/recipes and of
  # "In huis"), as an array in id order. A hand-set tag is filtered in the database; an
  # automatic one (vegetarisch) is worked out per recipe by the evaluator, and "met_wissel"
  # passes too (a swap makes it vegetarian). Loaded with what the evaluator and the list
  # need, so there is no query per recipe. Works on a scope: Recipe.in_category(3).with_all_tags(...).
  def self.with_all_tags(names, evaluator:)
    automatic, manual = normalize_tag_names(names).partition { |name| evaluator.automatic?(name) }
    recipes = visible.tagged_with_all(manual).includes(:tags, :category, RecipeTagEvaluator::PRELOAD).order(:id)
    return recipes.to_a if automatic.empty?

    recipes.select { |recipe| (automatic - evaluator.passing_names(recipe)).empty? }
  end

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
  # Automatic tags (vegetarisch) are not allowed: those are worked out (RecipeTagEvaluator).
  def tag_names=(names)
    @tag_names = normalize_tag_names(names)
  end

  def tag_names
    @tag_names || tags.map(&:name)
  end

  # category_name: "Diner" (in any case) picks that category; a new name makes a new one,
  # at the end of the order (see Category.named). "" or nil: no category. Without
  # category_name in a request, the category stays as it is.
  def category_name=(name)
    @category_name = Category.normalize_value_for(:name, name.to_s)
  end

  def category_name
    @category_name.nil? ? category&.name : @category_name.presence
  end

  # What "Alles op lijst" (only: nil, without the optional ingredients) or "+ lijst"
  # (only: [ row id ]) puts on the shopping list, scaled to servings. Attributes for
  # ShoppingListItem (see ShoppingListAddition). swaps: { row id => alternative } for the
  # rows swapped on the recipe page; an optional row stays optional when swapped.
  def shopping_list_items(servings:, only: nil, swaps: {})
    rows = only ? recipe_ingredients.select { |row| only.include?(row.id) } : recipe_ingredients.reject(&:optional)

    ShoppingListItem.lines_for(rows.map { |row| row.shopping_line(swaps[row.id]) },
      factor: Rational(servings, self.servings), source_label: title, recipe_id: id)
  end

  # Puts an older version back: title, description, servings, category, tags, ingredients
  # (with their alternatives), steps and variations. Ingredient rows are replaced by new ones, in the order of the snapshot.
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
      # Automatic tags are worked out now; an older version may still have them by hand.
      self.tag_names = snapshot["tag_names"] - Tag.automatic_names
      # A version from before categories existed says nothing about them: keep the current one.
      self.category_name = snapshot["category"] if snapshot.key?("category")

      # Not through *_attributes=: an old version may have no ingredients or steps, and
      # that minimum only applies to what a person submits.
      # A version from before alternatives existed has none.
      recipe_ingredients.each(&:mark_for_destruction)
      snapshot["ingredients"].each do |row|
        built = recipe_ingredients.build(row.except("alternatives"))
        row.fetch("alternatives", []).each { |alternative| built.alternatives.build(alternative) }
      end
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
    # Tag changes that do not fit the restored tags are left out, as link_tags does on an
    # edit. That matters for a version from before variations existed: it keeps the current
    # variations, whose tag changes were made against today's tags, not the restored ones.
    def restore_variations!(list)
      row_ids = recipe_ingredients.reload.to_h { |row| [ row.ingredient_name, row.id ] }
      automatic = Tag.automatic_names
      current = variations.reload.index_by(&:id)
      RecipeVariation.where(recipe_id: id).where.not(id: list.map { |data| data["id"] }).delete_all

      list.each do |data|
        variation = current[data["id"]] || variations.build
        variation.skip_recipe_version = true
        variation.update!(name: data["name"], notes: data["notes"], position: data["position"],
          removed_ingredient_ids: data["removed"].filter_map { |name| row_ids[name] },
          added_ingredients: data["added"],
          added_tag_names: data["tags_added"] - tag_names - automatic, removed_tag_names: data["tags_removed"] & tag_names)
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
      @tag_names = @category_name = nil
      association(:steps).target.each { |step| step.request_order = nil }
    end

    # The same rules as Tag#name (see TagNames), with the errors on "tag_names".
    def tag_names_allowed
      automatic = Tag.automatic_names
      validate_tag_names(:tag_names, @tag_names, max: MAX_TAGS) do |name|
        errors.add(:tag_names, :automatic_tag, name: name) if automatic.include?(name)
      end
    end

    # A new name must be a valid category name; an existing one is fine as it is.
    def category_name_allowed
      return if Category.find_named(@category_name)

      category = Category.new(name: @category_name, position: 0)
      return if category.valid?

      category.errors.each { |error| errors.add(:category_name, error.type, **error.options) }
    end

    def link_category
      self.category = @category_name.empty? ? nil : Category.named(@category_name)
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
