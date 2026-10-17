class Ingredient < ApplicationRecord
  include DecimalComma

  MAX_NAME_LENGTH = 100
  MAX_GRAMS = 100_000
  # Per 100 g: never more than 100 g of a nutrient, and fat (9 kcal/g) stays under 1000 kcal.
  LABEL_MAXIMUM = { "kcal" => 1000 }.freeze
  LABEL_COLUMNS = NevoFood::NUTRIENTS.to_h { |nutrient| [ nutrient, :"label_#{nutrient}" ] }.freeze
  # A teaspoon and a tablespoon, in ml. From there grams_per_ml takes over.
  ML_PER_UNIT = { "ml" => 1, "tl" => 5, "el" => 15 }.freeze

  # An ingredient still used by a recipe cannot be deleted.
  has_many :recipe_ingredients, dependent: :restrict_with_error
  has_many :recipe_ingredient_alternatives, dependent: :restrict_with_error
  # Optional: an ingredient without a link is simply not counted in the nutrition.
  belongs_to :nevo_food, optional: true
  # vlees, dierlijk, gluten, ...: what the automatic tags look at (RecipeTagEvaluator).
  # traits_checked: someone confirmed them ("Gecontroleerd"); new ingredients start unchecked.
  has_many :ingredient_traits, dependent: :delete_all
  has_many :traits, through: :ingredient_traits
  # In the house or not (PantryItem): a row only where it differs from staple, the default.
  has_one :pantry_item, dependent: :delete
  # The database unlinks shopping list lines when an ingredient goes (on_delete: :nullify).
  has_many :shopping_list_items, dependent: nil

  # "  Verse   BASILICUM " and "verse basilicum" are the same ingredient.
  normalizes :name, with: ->(name) { name.squish.downcase }
  # "1,5" from a Dutch keyboard is 1.5; empty is nil (unknown).
  decimal_comma :grams_per_piece, :grams_per_ml, *LABEL_COLUMNS.values

  validates :name, presence: true, length: { maximum: MAX_NAME_LENGTH }, uniqueness: true
  # A nevo_food_id that does not exist: a validation error instead of a foreign key error.
  validates :nevo_food, presence: true, unless: -> { nevo_food_id.nil? }
  validates :grams_per_piece, :grams_per_ml, numericality: { greater_than: 0, less_than: MAX_GRAMS }, allow_nil: true
  LABEL_COLUMNS.each do |nutrient, column|
    validates column, numericality: { greater_than_or_equal_to: 0, less_than_or_equal_to: LABEL_MAXIMUM.fetch(nutrient, 100) },
      allow_nil: true
  end

  # [value per 100, source, basis]: the label value (per 100 g) wins over NEVO (per 100 g
  # or per 100 ml). [nil, nil, nil] when neither knows it.
  def nutrient(nutrient)
    label = public_send(LABEL_COLUMNS.fetch(nutrient))
    return [ label, :label, "g" ] unless label.nil?

    value = nevo_food&.public_send(nutrient)
    value.nil? ? [ nil, nil, nil ] : [ value, :nevo, nevo_food.unit ]
  end

  def label_values?
    LABEL_COLUMNS.values.any? { |column| !public_send(column).nil? }
  end

  # Something to count with: a NEVO product or at least one label value. A negligible
  # ingredient counts as 0 instead (see Nutrition).
  def nutrition_source?
    !nevo_food.nil? || label_values?
  end

  # An amount in the recipe as grams or millilitres (basis "g" or "ml"), or nil when the
  # conversion for it is not filled in. g always counts directly; there is no default
  # density, also not for ml.
  def amount_in(basis, quantity, unit)
    grams = grams_for(quantity, unit)
    millilitres = ML_PER_UNIT.key?(unit) ? quantity * ML_PER_UNIT[unit] : (grams && grams_per_ml && grams / grams_per_ml)
    basis == "ml" ? millilitres : grams
  end

  # In the house: what the pantry row says, or else the default (a staple is).
  def in_house?
    pantry_item ? pantry_item.present : staple
  end

  # The trait ids, from the preloaded ingredient_traits (RecipeTagEvaluator::PRELOAD), so
  # a recipe list needs no query per ingredient.
  def trait_ids_loaded
    ingredient_traits.map(&:trait_id)
  end

  # names: [ "vlees", "dierlijk" ]. Replaces all traits; an unknown name is left out.
  def trait_names=(names)
    self.traits = Trait.where(name: Array.wrap(names).map { |name| Trait.normalize_value_for(:name, name.to_s) })
  end

  private
    def grams_for(quantity, unit)
      case unit
      when "g" then quantity
      when "stuks" then grams_per_piece && quantity * grams_per_piece
      else grams_per_ml && quantity * ML_PER_UNIT.fetch(unit) * grams_per_ml
      end
    end
end
