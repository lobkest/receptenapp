# The JSON shapes for ingredients and NEVO products (see RecipeSerializer for why explicit).
module IngredientSerializer
  module_function

  # For the list: is it linked, and does it still need checking.
  def summary(ingredient)
    {
      "id" => ingredient.id,
      "name" => ingredient.name,
      "nevo_food" => ingredient.nevo_food && { "code" => ingredient.nevo_food.code, "name" => ingredient.nevo_food.display_name },
      "label_values" => ingredient.label_values?,
      "needs_review" => ingredient.needs_review
    }
  end

  # For the edit page. units: how recipes and variations use it, so the page can say which
  # conversion is needed (stuks → gram per stuk; ml, tl, el → gram per ml).
  def detail(ingredient)
    summary(ingredient).merge(
      "lock_version" => ingredient.lock_version,
      "nevo_food" => ingredient.nevo_food && nevo_food(ingredient.nevo_food),
      "grams_per_piece" => number(ingredient.grams_per_piece),
      "grams_per_ml" => number(ingredient.grams_per_ml),
      "label" => Ingredient::LABEL_COLUMNS.transform_values { |column| number(ingredient.public_send(column)) },
      "units" => units(ingredient)
    )
  end

  # name: the readable synonym when there is one; official_name: NEVO's own name.
  def nevo_food(food)
    {
      "id" => food.id, "code" => food.code, "name" => food.display_name, "official_name" => food.name,
      "unit" => food.unit, "version" => NevoFood.citation_version(food.version),
      **NevoFood::NUTRIENTS.index_with { |nutrient| number(food.public_send(nutrient)) }
    }
  end

  def units(ingredient)
    (ingredient.recipe_ingredients.where.not(unit: nil).distinct.pluck(:unit) +
      VariationChange.kind_add.where(name: ingredient.name).where.not(unit: nil).distinct.pluck(:unit)).uniq.sort
  end

  def number(decimal)
    RecipeSerializer.number(decimal)
  end
end
