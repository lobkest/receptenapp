# The JSON shapes of the API, written out explicitly. Adding or renaming a column
# never changes what clients receive by accident.
module RecipeSerializer
  SUMMARY_FIELDS = %w[ id title description servings status created_at updated_at ].freeze

  module_function

  # For lists: no ingredients or steps.
  def summary(recipe)
    recipe.slice(*SUMMARY_FIELDS)
  end

  # For a single recipe. Load it with Recipe.with_details to avoid one query per ingredient.
  def detail(recipe)
    summary(recipe).merge(
      "ingredients" => recipe.recipe_ingredients.map { |row| ingredient(row) },
      "steps" => recipe.steps.map { |step| { "position" => step.position, "body" => step.body } }
    )
  end

  def ingredient(row)
    { "name" => row.ingredient_name, "quantity" => number(row.quantity), "unit" => row.unit, "note" => row.note }
  end

  # Rails turns a BigDecimal into the string "200.0"; the API sends the number 200 or 0.5.
  def number(decimal)
    return if decimal.nil?

    decimal == decimal.to_i ? decimal.to_i : decimal.to_f
  end
end
