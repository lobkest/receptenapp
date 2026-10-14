# The JSON shapes of the API, written out explicitly. Adding or renaming a column
# never changes what clients receive by accident.
module RecipeSerializer
  SUMMARY_FIELDS = %w[ id title description servings created_at updated_at ].freeze

  module_function

  # For lists: no ingredients or steps. Load with includes(:tags) to avoid one query per recipe.
  def summary(recipe)
    recipe.slice(*SUMMARY_FIELDS).merge("tags" => recipe.tags.map(&:name).sort)
  end

  # For a single recipe. Load it with Recipe.with_details to avoid one query per ingredient.
  # Row ids let the edit form change (id) and remove (_destroy) existing rows; lock_version
  # goes back with the edit, so a change by someone else in between is noticed (409).
  def detail(recipe)
    summary(recipe).merge(
      "lock_version" => recipe.lock_version,
      "ingredients" => recipe.recipe_ingredients.map { |row| ingredient(row) },
      "steps" => recipe.steps.map { |step| { "id" => step.id, "position" => step.position, "body" => step.body } }
    )
  end

  def ingredient(row)
    { "id" => row.id, "name" => row.ingredient_name, "quantity" => number(row.quantity), "unit" => row.unit, "optional" => row.optional }
  end

  # Rails turns a BigDecimal into the string "200.0"; the API sends the number 200 or 0.5.
  def number(decimal)
    return if decimal.nil?

    decimal == decimal.to_i ? decimal.to_i : decimal.to_f
  end
end
