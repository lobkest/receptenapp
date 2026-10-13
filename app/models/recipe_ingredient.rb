class RecipeIngredient < ApplicationRecord
  MAX_NOTE_LENGTH = 100
  MAX_QUANTITY = 100_000

  belongs_to :recipe
  # Optional here because ingredient_name is validated instead; the column is NOT NULL.
  belongs_to :ingredient, optional: true

  # prefix: unit_g? instead of g?, and no scope called RecipeIngredient.g.
  enum :unit, { g: "g", ml: "ml", stuks: "stuks" }, prefix: true, validate: { allow_nil: true }

  normalizes :note, with: ->(note) { note.squish.presence }

  before_validation :clear_unit_without_quantity
  before_validation :link_ingredient
  # prepend: runs before the belongs_to autosave would insert the new ingredient itself.
  before_save :save_new_ingredient, prepend: true

  validates :ingredient_name, presence: true, length: { maximum: Ingredient::MAX_NAME_LENGTH }
  validates :quantity, numericality: { greater_than: 0, less_than: MAX_QUANTITY }, allow_nil: true
  validates :unit, presence: true, if: -> { quantity.present? }
  validates :note, length: { maximum: MAX_NOTE_LENGTH }
  validate :ingredient_not_repeated

  attr_writer :ingredient_name

  # The submitted name, normalized like Ingredient#name, or the linked ingredient's name.
  def ingredient_name
    return ingredient&.name if @ingredient_name.nil?

    Ingredient.normalize_value_for(:name, @ingredient_name.to_s)
  end

  private
    # A unit means nothing without an amount ("zout — naar smaak").
    def clear_unit_without_quantity
      self.unit = nil if quantity.nil?
    end

    # Looks up the ingredient, but only builds a new one in memory: nothing is written
    # unless the whole recipe turns out valid.
    def link_ingredient
      return if @ingredient_name.nil? || ingredient_name.blank?

      self.ingredient = Ingredient.find_by(name: ingredient_name) || Ingredient.new(name: ingredient_name)
    end

    # Runs inside the recipe's save transaction, so a failed save rolls it back too.
    # create_or_find_by! uses a savepoint: if another request just created the same
    # ingredient, the unique index fails quietly and the existing row is returned.
    def save_new_ingredient
      self.ingredient = Ingredient.create_or_find_by!(name: ingredient.name) if ingredient&.new_record?
    end

    # The same ingredient twice in one recipe: the later row gets the error.
    def ingredient_not_repeated
      return if recipe.nil? || ingredient_name.blank?

      earlier = recipe.recipe_ingredients.take_while { |other| !other.equal?(self) }
      if earlier.any? { |other| !other.marked_for_destruction? && other.ingredient_name == ingredient_name }
        errors.add(:ingredient_name, :taken)
      end
    end
end
