# A variation on a recipe: "met kip" leaves out the tofu, adds 150 g kip and takes off
# the tag vega. The base recipe stays as it is; the variation only stores the differences:
# - removals: rows of the base recipe to leave out (VariationChange, kind remove);
# - additions: extra ingredients (VariationChange, kind add);
# - tag_changes: tags it adds or takes off (VariationTagChange). Not the automatic tags:
#   those follow from the ingredients (RecipeTagEvaluator#variation_changes).
#
# Anyone may add and edit (lock_version, like Recipe); deleting is a request (DeletionRequestable).
# Every change is part of the recipe's history: it makes a new RecipeVersion.
class RecipeVariation < ApplicationRecord
  include DeletionRequestable
  include TagNames

  MAX_PER_RECIPE = 10
  MAX_NAME_LENGTH = 60
  MAX_NOTES_LENGTH = 2000
  MAX_ADDITIONS = 30
  MAX_ADDED_TAGS = 10

  # What a request may set (strong parameters), for Api::RecipeVariationsController and for a
  # variation added with the recipe form (Api::RecipesController). [ [ ... ] ] means "an
  # array of hashes with these keys".
  PERMITTED_ATTRIBUTES = [ :name, :notes, {
    removed_ingredient_ids: [], added_tag_names: [], removed_tag_names: [],
    added_ingredients: [ [ :name, :quantity, :unit ] ]
  } ].freeze

  # What the API and the snapshots need, in one go (see the with_details scope).
  DETAILS = [ { removals: { recipe_ingredient: :ingredient } }, :additions, { tag_changes: :tag } ].freeze

  belongs_to :recipe, inverse_of: :variations

  # Two views on the same table. Building through one sets kind (from the where).
  has_many :removals, -> { kind_remove.order(:id) }, class_name: "VariationChange",
    inverse_of: :recipe_variation, autosave: true
  has_many :additions, -> { kind_add.order(:id) }, class_name: "VariationChange",
    inverse_of: :recipe_variation, index_errors: :nested_attributes_order
  has_many :tag_changes, -> { order(:id) }, class_name: "VariationTagChange",
    inverse_of: :recipe_variation, autosave: true

  accepts_nested_attributes_for :additions, limit: Recipe::MAX_NESTED_ROWS

  scope :with_details, -> { includes(*DETAILS) }

  normalizes :name, with: ->(name) { name.squish }
  normalizes :notes, with: ->(notes) { notes.strip.presence }

  validates :name, presence: true, length: { maximum: MAX_NAME_LENGTH }
  validates :notes, length: { maximum: MAX_NOTES_LENGTH }
  validate :within_limit, on: :create
  validate :additions_count
  validate :tag_names_allowed, if: :tag_names_submitted?

  # Set when the variation is saved as part of something that makes its own version: a
  # recipe edit (nested) or Recipe#restore_version!.
  attr_accessor :skip_recipe_version

  before_create :set_position
  # Also before deleting: then the variation is still in that first version, so the admin
  # can bring it back by restoring the version.
  before_save :record_original_recipe_version, unless: :skip_recipe_version
  before_destroy :record_original_recipe_version, unless: :skip_recipe_version
  # Tags are linked in the same transaction, and only once the variation is valid.
  before_save :link_tag_changes, if: :tag_names_submitted?
  before_save :touch_for_locking, if: :persisted?
  after_save :record_recipe_version, unless: :skip_recipe_version
  after_save :forget_submitted_tags
  after_destroy :record_recipe_version, unless: :skip_recipe_version

  # [12, 15]: ids of rows of the base recipe to leave out. Replaces the earlier list;
  # removals that stay keep their row.
  def removed_ingredient_ids=(ids)
    ids = Array.wrap(ids).compact_blank.map { |id| Integer(id.to_s, exception: false) }.uniq

    removals.each { |removal| removal.mark_for_destruction unless ids.include?(removal.recipe_ingredient_id) }
    (ids - removals.map(&:recipe_ingredient_id)).each { |id| removals.build(recipe_ingredient_id: id) }
  end

  def removed_ingredient_ids
    removals.reject(&:marked_for_destruction?).map(&:recipe_ingredient_id)
  end

  # [{ name: "kip", quantity: "150", unit: "g" }]. Replaces all added ingredients. Through
  # additions_attributes=, so errors read "additions[1].quantity" (the place in this list).
  def added_ingredients=(rows)
    additions.each(&:mark_for_destruction)
    self.additions_attributes = Array.wrap(rows).map { |row| row.to_h.symbolize_keys.slice(:name, :quantity, :unit) }
  end

  # Tag names, normalized like Tag#name. Without them in a request, tag changes stay as they are.
  def added_tag_names=(names)
    @added_tag_names = normalize_tag_names(names)
  end

  def removed_tag_names=(names)
    @removed_tag_names = normalize_tag_names(names)
  end

  def added_tag_names
    @added_tag_names || stored_tag_names("add")
  end

  def removed_tag_names
    @removed_tag_names || stored_tag_names("remove")
  end

  # What "Variatie op lijst" puts on the shopping list: the base recipe without the
  # removed rows and without optional ingredients, plus the added ones, all scaled to
  # servings. Attributes for ShoppingListItem (see ShoppingListAddition).
  # only: picking single rows is for the recipe itself (Recipe#shopping_list_items).
  # swaps: rows of the base recipe swapped for an alternative; a removed row stays removed.
  # The added ingredients have no alternatives, and get their ingredient by name
  # (ShoppingListItem links it).
  def shopping_list_items(servings:, only: nil, swaps: {})
    raise ArgumentError, "a variation always goes on the list as a whole" if only

    removed = removed_ingredient_ids
    rows = recipe.recipe_ingredients.reject { |row| row.optional || removed.include?(row.id) }
      .map { |row| row.shopping_line(swaps[row.id]) }
    rows += additions.map { |addition| [ addition.name, addition.quantity, addition.unit ] }

    ShoppingListItem.lines_for(rows, factor: Rational(servings, recipe.servings),
      source_label: "#{recipe.title} (variatie: #{name})", recipe_id: recipe.id)
  end

  private
    def stored_tag_names(kind)
      tag_changes.select { |change| change.kind == kind && !change.marked_for_destruction? }.map { |change| change.tag.name }.sort
    end

    def tag_names_submitted?
      !@added_tag_names.nil? || !@removed_tag_names.nil?
    end

    # Counted in the database: a variation saved together with others (a recipe edit) is
    # held to the recipe's own limit instead (accepts_nested_attributes_for :variations).
    def within_limit
      return if recipe.nil? || recipe.new_record?

      if RecipeVariation.where(recipe_id: recipe.id).count >= MAX_PER_RECIPE
        errors.add(:base, :too_many_variations, count: MAX_PER_RECIPE)
      end
    end

    def additions_count
      if additions.reject(&:marked_for_destruction?).size > MAX_ADDITIONS
        errors.add(:additions, :too_many, count: MAX_ADDITIONS)
      end
    end

    # Against the recipe's tags as they will be saved (tag_names), so this also works for
    # a variation submitted together with a recipe edit that changes the tags.
    # Automatic tags (vegetarisch) are worked out for the variation too, never set by hand.
    def tag_names_allowed
      base = recipe&.tag_names || []
      automatic = Tag.automatic_names

      validate_tag_names(:added_tag_names, added_tag_names, max: MAX_ADDED_TAGS) do |name|
        errors.add(:added_tag_names, :automatic_tag, name: name) if automatic.include?(name)
        errors.add(:added_tag_names, :tag_on_recipe, name: name) if base.include?(name)
      end
      removed_tag_names.each do |name|
        if automatic.include?(name)
          errors.add(:removed_tag_names, :automatic_tag, name: name)
        elsif !base.include?(name)
          errors.add(:removed_tag_names, :tag_not_on_recipe, name: name)
        end
      end
    end

    # Changes that stay keep their row; the others go, the new ones are added.
    # Tag.named creates a tag that does not exist yet ("+ vis").
    def link_tag_changes
      wanted = added_tag_names.map { |name| [ Tag.named(name), "add" ] } +
        removed_tag_names.map { |name| [ Tag.named(name), "remove" ] }
      keys = wanted.map { |tag, kind| [ tag.id, kind ] }

      tag_changes.each { |change| change.mark_for_destruction unless keys.include?([ change.tag_id, change.kind ]) }
      kept = tag_changes.reject(&:marked_for_destruction?).map { |change| [ change.tag_id, change.kind ] }
      wanted.each { |tag, kind| tag_changes.build(tag: tag, kind: kind) unless kept.include?([ tag.id, kind ]) }
    end

    def forget_submitted_tags
      @added_tag_names = @removed_tag_names = nil
    end

    # After the last one, so a new variation goes at the end. Restoring a version keeps
    # the position from the snapshot.
    def set_position
      self.position ||= (RecipeVariation.where(recipe_id: recipe_id).maximum(:position) || 0) + 1
    end

    # Like Recipe#touch_for_locking: a change to only a removal, an addition or a tag
    # would not update this row, and then lock_version would not be checked.
    def touch_for_locking
      self.updated_at = Time.current
    end

    # A recipe from before versions existed: keep its old state before the first change.
    def record_original_recipe_version
      RecipeVersion.record!(recipe, note: "Oorspronkelijke versie") unless recipe.versions.exists?
    end

    def record_recipe_version
      RecipeVersion.record!(recipe)
    end
end
