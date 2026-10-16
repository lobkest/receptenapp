# Something to use instead of one ingredient row: "of: tofu" under "250 g kip". The
# recipe page can swap the row for it; then the list, the scaling and "op lijst" use the
# alternative. The rest of the row (optional, its place) stays the same.
#
# Without a quantity (and so without a unit) the alternative uses the amount of the
# original row: effective_quantity and effective_unit.
class RecipeIngredientAlternative < ApplicationRecord
  include HasQuantity
  include NamedIngredient

  belongs_to :recipe_ingredient, inverse_of: :alternatives

  unit_enum

  validates :ingredient_name, presence: true, length: { maximum: Ingredient::MAX_NAME_LENGTH }
  has_quantity
  validate :differs_from_original
  validate :not_repeated

  # The amount to use: its own, or the original row's ("zelfde als origineel").
  def effective_quantity
    own_amount? ? quantity : recipe_ingredient.quantity
  end

  def effective_unit
    own_amount? ? unit : recipe_ingredient.unit
  end

  # A quantity always comes with a unit (HasQuantity), so the quantity says it all.
  def own_amount?
    !quantity.nil?
  end

  private
    def differs_from_original
      return if recipe_ingredient.nil? || ingredient_name.blank?

      errors.add(:ingredient_name, :same_as_original) if ingredient_name == recipe_ingredient.ingredient_name
    end

    # The same alternative twice under one row. The later one gets the error, or this one
    # when the other is not checked in this save (it did not change).
    def not_repeated
      return if recipe_ingredient.nil? || ingredient_name.blank?

      siblings = recipe_ingredient.alternatives.reject { |other| other.marked_for_destruction? }
      index = siblings.index { |other| other.equal?(self) } || siblings.size
      repeated = siblings.each_with_index.any? do |other, other_index|
        !other.equal?(self) && other.ingredient_name == ingredient_name &&
          (other_index < index || !other.changed_for_autosave?)
      end
      errors.add(:ingredient_name, :taken) if repeated
    end
end
