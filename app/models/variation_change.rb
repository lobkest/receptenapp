# One ingredient change in a RecipeVariation:
# - remove: leaves out a row of the base recipe (recipe_ingredient). The row keeps its id
#   when the recipe is edited, so the change stays attached; deleting the row deletes it.
# - add: an extra ingredient with its own name and amount, the same rules as RecipeIngredient.
# The database checks that each kind has exactly its own fields (variation_changes_fields_match_kind).
class VariationChange < ApplicationRecord
  include DecimalComma

  belongs_to :recipe_variation
  belongs_to :recipe_ingredient, optional: true

  # prefix: kind_add? and VariationChange.kind_remove, not add? and remove.
  enum :kind, { add: "add", remove: "remove" }, prefix: true, validate: true
  enum :unit, { g: "g", ml: "ml", stuks: "stuks" }, prefix: true, validate: { allow_nil: true }

  # "1,5" → 1.5 (see DecimalComma). Empty stays nil: "naar smaak".
  decimal_comma :quantity

  # Like Ingredient#name: "  Rode  UI " is "rode ui".
  normalizes :name, with: ->(name) { name.squish.downcase }

  before_validation :clear_unit_without_quantity, if: :kind_add?

  with_options if: :kind_add? do
    validates :name, presence: true, length: { maximum: Ingredient::MAX_NAME_LENGTH }
    validates :quantity, numericality: { greater_than: 0, less_than: RecipeIngredient::MAX_QUANTITY }, allow_nil: true
    validates :unit, presence: true, if: -> { quantity.present? }
    validates :recipe_ingredient_id, absence: true
  end

  with_options if: :kind_remove? do
    validates :recipe_ingredient_id, presence: true
    validates :name, :quantity, :unit, absence: true
    validate :row_of_the_same_recipe
  end

  # The name to show: the added one, or that of the removed row.
  def ingredient_name
    kind_remove? ? recipe_ingredient&.ingredient_name : name
  end

  private
    # A unit means nothing without an amount ("zout — naar smaak").
    def clear_unit_without_quantity
      self.unit = nil if quantity.nil?
    end

    # Looked up among the recipe's own rows, in memory: that also catches a row that is
    # being removed in the same save (a recipe edit that adds this variation).
    def row_of_the_same_recipe
      return if recipe_ingredient_id.blank? || recipe_variation&.recipe.nil?

      row = recipe_variation.recipe.recipe_ingredients.find { |other| other.id == recipe_ingredient_id }
      if row.nil?
        errors.add(:recipe_ingredient, :other_recipe)
      elsif row.marked_for_destruction?
        errors.add(:recipe_ingredient, :being_removed)
      end
    end
end
