# One ingredient change in a RecipeVariation:
# - remove: leaves out a row of the base recipe (recipe_ingredient). The row keeps its id
#   when the recipe is edited, so the change stays attached; deleting the row deletes it.
# - add: an extra ingredient with its own name and amount, the same rules as RecipeIngredient.
# The database checks that each kind has exactly its own fields (variation_changes_fields_match_kind).
class VariationChange < ApplicationRecord
  include HasQuantity

  belongs_to :recipe_variation
  belongs_to :recipe_ingredient, optional: true

  # prefix: kind_add? and VariationChange.kind_remove, not add? and remove.
  enum :kind, { add: "add", remove: "remove" }, prefix: true, validate: true
  unit_enum

  # Like Ingredient#name: "  Rode  UI " is "rode ui".
  normalizes :name, with: ->(name) { name.squish.downcase }

  validates :name, presence: true, length: { maximum: Ingredient::MAX_NAME_LENGTH }, if: :kind_add?
  # Only an added ingredient has its own amount.
  has_quantity if: :kind_add?
  validates :recipe_ingredient_id, absence: true, if: :kind_add?

  # An added ingredient is an Ingredient too, so the ingredients page can give it traits
  # (the automatic tags of the variation look at them) and link it to NEVO.
  before_save :save_new_ingredient, if: -> { kind_add? && will_save_change_to_name? }

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
    # create_or_find_by!: in a savepoint, so another request making the same ingredient at
    # the same moment does not break this save.
    def save_new_ingredient
      Ingredient.create_or_find_by!(name: name) unless Ingredient.exists?(name: name)
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
