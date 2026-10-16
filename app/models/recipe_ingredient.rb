class RecipeIngredient < ApplicationRecord
  include HasQuantity
  include NamedIngredient

  MAX_ALTERNATIVES = 5

  belongs_to :recipe

  # "of: tofu" under "250 g kip". index_errors: errors read
  # "recipe_ingredients[0].alternatives[1].ingredient_name".
  has_many :alternatives, -> { order(:position, :id) }, class_name: "RecipeIngredientAlternative",
    dependent: :destroy, inverse_of: :recipe_ingredient, index_errors: :nested_attributes_order
  accepts_nested_attributes_for :alternatives, allow_destroy: true, limit: Recipe::MAX_NESTED_ROWS

  unit_enum

  before_validation :number_alternatives

  validates :ingredient_name, presence: true, length: { maximum: Ingredient::MAX_NAME_LENGTH }
  has_quantity
  validate :ingredient_not_repeated
  validate :alternatives_count
  validate :original_not_among_alternatives, if: -> { will_save_change_to_ingredient_id? || ingredient&.new_record? }

  # [name, quantity, unit] for the shopping list: this row, or the alternative it is
  # swapped for (with the row's amount when the alternative has none of its own).
  def shopping_line(alternative = nil)
    return [ ingredient_name, quantity, unit ] if alternative.nil?

    [ alternative.ingredient_name, alternative.effective_quantity, alternative.effective_unit ]
  end

  private
    # The same ingredient twice in one recipe: the later row gets the error.
    def ingredient_not_repeated
      return if recipe.nil? || ingredient_name.blank?

      earlier = recipe.recipe_ingredients.take_while { |other| !other.equal?(self) }
      if earlier.any? { |other| !other.marked_for_destruction? && other.ingredient_name == ingredient_name }
        errors.add(:ingredient_name, :taken)
      end
    end

    # Only when something was done with them: then the whole list, also the ones the request
    # did not mention (nested attributes only load the ids it names).
    def kept_alternatives
      return [] if association(:alternatives).target.empty?

      alternatives.reject(&:marked_for_destruction?)
    end

    # Positions are 1..n in the order of the list: existing ones first, new ones after.
    def number_alternatives
      kept_alternatives.each.with_index(1) { |alternative, position| alternative.position = position }
    end

    def alternatives_count
      errors.add(:alternatives, :too_many, count: MAX_ALTERNATIVES) if kept_alternatives.size > MAX_ALTERNATIVES
    end

    # The row is renamed to one of its own alternatives that stays as it is. A changed or
    # new alternative is checked itself (RecipeIngredientAlternative#differs_from_original);
    # an unchanged one is not validated again, so that case is caught here.
    def original_not_among_alternatives
      return if ingredient_name.blank?

      unchanged = alternatives.reject { |alternative| alternative.marked_for_destruction? || alternative.changed_for_autosave? }
      errors.add(:alternatives, :same_as_original) if unchanged.any? { |alternative| alternative.ingredient_name == ingredient_name }
    end
end
