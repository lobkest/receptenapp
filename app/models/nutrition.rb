# The estimated nutrition of a recipe or a variation, worked out when it is asked for
# (no cache): the sum over the lines that can be counted, for the whole recipe and per
# serving. A line is not counted when it is optional, has no amount, its ingredient has
# no NEVO link and no label values, or its unit cannot be turned into grams (or ml, for a
# NEVO product per 100 ml) because the conversion is empty.
#
#   Nutrition.for_recipe(recipe).to_h
#   Nutrition.for_variation(variation).to_h
#
# A nutrient that NEVO does not know for a counted line (an empty value, not 0) leaves that
# line out of that nutrient only; to_h names it under "unknown".
#
# Per serving does not change when you scale the recipe on the page; the total does, and
# the frontend multiplies per_serving by the chosen servings for that.
class Nutrition
  Line = Data.define(:name, :ingredient, :quantity, :unit, :optional)

  # Why a line does not count, as the recipe page shows it.
  REASONS = {
    optional: "optioneel",
    no_quantity: "geen hoeveelheid",
    not_linked: "niet gekoppeld",
    no_grams_per_piece: "gram per stuk ontbreekt",
    no_grams_per_ml: "gram per ml ontbreekt"
  }.freeze

  # The rows of the recipe. Load with Recipe.with_details (ingredient and nevo_food).
  def self.for_recipe(recipe)
    lines = recipe.recipe_ingredients.map { |row| Line.new(row.ingredient_name, row.ingredient, row.quantity, row.unit, row.optional) }
    new(lines, servings: recipe.servings)
  end

  # The base recipe without the removed rows, plus the added ingredients. An added
  # ingredient with the name of an existing ingredient uses that one's link and conversions.
  # recipe and ingredients ({ name => Ingredient }): already loaded by the caller, so the
  # recipe page looks everything up once for all its variations.
  def self.for_variation(variation, recipe: nil, ingredients: nil)
    recipe ||= Recipe.includes(recipe_ingredients: { ingredient: :nevo_food }).find(variation.recipe_id)
    removed = variation.removed_ingredient_ids
    ingredients ||= Ingredient.includes(:nevo_food).where(name: variation.additions.map(&:name)).index_by(&:name)

    lines = recipe.recipe_ingredients.reject { |row| removed.include?(row.id) }
      .map { |row| Line.new(row.ingredient_name, row.ingredient, row.quantity, row.unit, row.optional) }
    lines += variation.additions.map { |addition| Line.new(addition.name, ingredients[addition.name], addition.quantity, addition.unit, false) }
    new(lines, servings: recipe.servings)
  end

  attr_reader :servings

  def initialize(lines, servings:)
    @lines = lines
    @servings = servings
  end

  def counted
    @counted ||= @lines.select { |line| reason(line).nil? }
  end

  # [[line, reason key]] for the lines that do not count.
  def not_counted
    @lines.filter_map { |line| (why = reason(line)) && [ line, why ] }
  end

  # { "kcal" => total, ... } for the recipe as written (its own servings). nil for a
  # nutrient no counted line knows.
  def total
    @total ||= NevoFood::NUTRIENTS.index_with do |nutrient|
      amounts = counted.filter_map { |line| contribution(line, nutrient) }
      amounts.sum if amounts.any?
    end
  end

  def per_serving
    total.transform_values { |value| value && value / servings }
  end

  # { "fiber" => [ "kaas" ] }: counted lines whose value for that nutrient is unknown.
  def unknown
    NevoFood::NUTRIENTS.index_with { |nutrient| counted.select { |line| contribution(line, nutrient).nil? }.map(&:name) }
      .reject { |_, names| names.empty? }
  end

  def label_values?
    counted.any? { |line| line.ingredient.label_values? }
  end

  # The NEVO versions in this calculation, as the citation writes them ("2025/9.0").
  def nevo_versions
    counted.filter_map { |line| line.ingredient.nevo_food&.version }.uniq.map { |version| NevoFood.citation_version(version) }
  end

  # What the API sends. Numbers rounded to one decimal; the page rounds further.
  def to_h
    {
      "servings" => servings,
      "counted" => counted.size,
      "total" => round(total),
      "per_serving" => round(per_serving),
      "not_counted" => not_counted.map { |line, why| { "name" => line.name, "reason" => REASONS.fetch(why) } },
      "unknown" => unknown,
      "sources" => counted.map { |line| { "name" => line.name, "source" => source(line) } },
      "label_values" => label_values?,
      "nevo_versions" => nevo_versions
    }
  end

  private
    def reason(line)
      return :optional if line.optional
      return :no_quantity if line.quantity.nil?
      return :not_linked unless line.ingredient&.nutrition_source?
      return if NevoFood::NUTRIENTS.any? { |nutrient| contribution(line, nutrient) }
      # Known values, but no amount to multiply them with.
      return :no_grams_per_piece if line.unit == "stuks"

      :no_grams_per_ml
    end

    # The amount of one nutrient this line brings, or nil when unknown.
    def contribution(line, nutrient)
      value, _source, basis = line.ingredient.nutrient(nutrient)
      return if value.nil?

      amount = line.ingredient.amount_in(basis, line.quantity, line.unit)
      amount && value * amount / 100
    end

    # "nevo", "etiket", or "nevo en etiket" when some nutrients come from each.
    def source(line)
      sources = NevoFood::NUTRIENTS.filter_map { |nutrient| line.ingredient.nutrient(nutrient)[1] }.uniq
      sources.map { |source| source == :label ? "etiket" : "nevo" }.sort.reverse.join(" en ")
    end

    def round(values)
      values.transform_values { |value| value&.round(1)&.to_f }
    end
end
