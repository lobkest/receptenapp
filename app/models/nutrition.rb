# The estimated nutrition of a recipe or a variation, worked out when it is asked for
# (no cache): the sum over the lines that can be counted, for the whole recipe and per
# serving. A line is not counted when it is optional, has no amount, its ingredient has
# no NEVO link and no label values, or its unit cannot be turned into grams (or ml, for a
# NEVO product per 100 ml) because the conversion is empty. A negligible ingredient
# (bakpoeder, specerijen) counts as 0 for everything and is not reported as missing.
#
#   Nutrition.for_recipe(recipe).to_h
#   Nutrition.for_variation(variation).to_h
#
# A nutrient that NEVO does not know for a counted line (an empty value, not 0) leaves that
# line out of that nutrient only; to_h names it under "unknown".
#
# to_h also sends every line with what it brings ("lines"), and the same for each of its
# alternatives. The recipe page adds those up itself, so swapping "kip" for "tofu" there
# changes the totals without asking the server again. total and per_serving are the
# recipe as written, without swaps.
#
# Per serving does not change when you scale the recipe on the page; the total does, and
# the frontend multiplies per_serving by the chosen servings for that.
class Nutrition
  # id: of the recipe row (or of the alternative, in alternatives); nil for a variation's
  # added ingredient. alternatives: Lines for what the row can be swapped for.
  Line = Data.define(:id, :name, :ingredient, :quantity, :unit, :optional, :alternatives)

  # Why a line does not count, as the recipe page shows it.
  REASONS = {
    optional: "optioneel",
    no_quantity: "geen hoeveelheid",
    not_linked: "niet gekoppeld",
    no_grams_per_piece: "gram per stuk ontbreekt",
    no_grams_per_ml: "gram per ml ontbreekt"
  }.freeze

  # The rows of the recipe. Load with Recipe.with_details (ingredient and nevo_food, also
  # of the alternatives).
  def self.for_recipe(recipe)
    new(recipe.recipe_ingredients.map { |row| row_line(row) }, servings: recipe.servings)
  end

  # The base recipe without the removed rows, plus the added ingredients. An added
  # ingredient with the name of an existing ingredient uses that one's link and conversions.
  # recipe and ingredients ({ name => Ingredient }): already loaded by the caller, so the
  # recipe page looks everything up once for all its variations.
  def self.for_variation(variation, recipe: nil, ingredients: nil)
    recipe ||= Recipe.includes(recipe_ingredients: [ { ingredient: :nevo_food }, { alternatives: { ingredient: :nevo_food } } ])
      .find(variation.recipe_id)
    removed = variation.removed_ingredient_ids
    ingredients ||= Ingredient.includes(:nevo_food).where(name: variation.additions.map(&:name)).index_by(&:name)

    lines = recipe.recipe_ingredients.reject { |row| removed.include?(row.id) }.map { |row| row_line(row) }
    lines += variation.additions.map do |addition|
      Line.new(nil, addition.name, ingredients[addition.name], addition.quantity, addition.unit, false, [])
    end
    new(lines, servings: recipe.servings)
  end

  # An alternative without its own amount uses the row's (effective_quantity).
  def self.row_line(row)
    alternatives = row.alternatives.map do |alternative|
      Line.new(alternative.id, alternative.ingredient_name, alternative.ingredient,
        alternative.effective_quantity, alternative.effective_unit, row.optional, [])
    end
    Line.new(row.id, row.ingredient_name, row.ingredient, row.quantity, row.unit, row.optional, alternatives)
  end
  private_class_method :row_line

  attr_reader :servings

  def initialize(lines, servings:)
    @lines = lines
    @servings = servings
  end

  # Counted lines, negligible ones included (they add 0).
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
    counted.any? { |line| label?(line) }
  end

  # The NEVO versions in this calculation, as the citation writes them ("2025/9.0").
  def nevo_versions
    counted.filter_map { |line| nevo_version(line) }.uniq
  end

  # What the API sends. Numbers rounded to one decimal; the page rounds further.
  # counted: without the negligible lines, so a recipe of only bakpoeder shows nothing.
  def to_h
    {
      "servings" => servings,
      "counted" => counted.count { |line| !negligible?(line) },
      "total" => round(total),
      "per_serving" => round(per_serving),
      "not_counted" => not_counted.map { |line, why| { "name" => line.name, "reason" => REASONS.fetch(why) } },
      "unknown" => unknown,
      "label_values" => label_values?,
      "nevo_versions" => nevo_versions,
      "lines" => @lines.map { |line| line_hash(line) }
    }
  end

  private
    def negligible?(line)
      line.ingredient&.negligible
    end

    def reason(line)
      return :optional if line.optional
      return if negligible?(line)
      return :no_quantity if line.quantity.nil?
      return :not_linked unless line.ingredient&.nutrition_source?
      return if NevoFood::NUTRIENTS.any? { |nutrient| contribution(line, nutrient) }
      # Known values, but no amount to multiply them with.
      return :no_grams_per_piece if line.unit == "stuks"

      :no_grams_per_ml
    end

    # The amount of one nutrient this line brings, or nil when unknown.
    def contribution(line, nutrient)
      return BigDecimal(0) if negligible?(line)

      value, _source, basis = line.ingredient.nutrient(nutrient)
      return if value.nil?

      amount = line.ingredient.amount_in(basis, line.quantity, line.unit)
      amount && value * amount / 100
    end

    def label?(line)
      !negligible?(line) && line.ingredient.label_values?
    end

    def nevo_version(line)
      return if negligible?(line) || line.ingredient.nevo_food.nil?

      NevoFood.citation_version(line.ingredient.nevo_food.version)
    end

    # One line for the page: its amount, what it brings for the whole recipe (nil when it
    # does not count, with the reason), and where the values come from.
    def line_hash(line)
      why = reason(line)
      counts = why.nil?
      amount = ->(basis) { line.quantity && line.ingredient && line.ingredient.amount_in(basis, line.quantity, line.unit)&.round(1)&.to_f }
      {
        "id" => line.id,
        "ingredient_id" => line.ingredient&.id,
        "name" => line.name,
        "grams" => amount.call("g"),
        "millilitres" => amount.call("ml"),
        "values" => counts ? NevoFood::NUTRIENTS.index_with { |nutrient| contribution(line, nutrient)&.round(1)&.to_f } : nil,
        "reason" => why && REASONS.fetch(why),
        "source" => counts ? source(line) : nil,
        "label" => counts && label?(line),
        "nevo_version" => counts ? nevo_version(line) : nil,
        "alternatives" => line.alternatives.map { |alternative| line_hash(alternative) }
      }
    end

    # The NEVO product's name, "etiket", both ("Kipfilet rauw + etiket") or "verwaarloosbaar".
    def source(line)
      return "verwaarloosbaar" if negligible?(line)

      sources = NevoFood::NUTRIENTS.filter_map { |nutrient| line.ingredient.nutrient(nutrient)[1] }.uniq
      nevo = sources.include?(:nevo) ? line.ingredient.nevo_food.display_name : nil
      [ nevo, ("etiket" if sources.include?(:label)) ].compact.join(" + ")
    end

    def round(values)
      values.transform_values { |value| value&.round(1)&.to_f }
    end
end
