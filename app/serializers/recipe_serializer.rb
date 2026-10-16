# The JSON shapes of the API, written out explicitly. Adding or renaming a column
# never changes what clients receive by accident.
module RecipeSerializer
  SUMMARY_FIELDS = %w[ id title description servings created_at updated_at ].freeze

  module_function

  # For lists: no ingredients or steps. Load with includes(:tags, :category) to avoid one
  # query per recipe. category is null for a recipe without one ("Overig").
  def summary(recipe)
    recipe.slice(*SUMMARY_FIELDS).merge(
      "tags" => recipe.tags.map(&:name).sort,
      "category" => recipe.category && category(recipe.category)
    )
  end

  # Also what /api/categories sends per category.
  def category(category)
    category.slice("id", "name", "position")
  end

  # For a single recipe. Load it with Recipe.with_details to avoid one query per ingredient
  # or variation. Row ids let the edit form change (id) and remove (_destroy) existing rows;
  # lock_version goes back with the edit, so a change by someone else in between is noticed (409).
  # Only visible variations: one with a deletion request is hidden, like a recipe.
  def detail(recipe)
    summary(recipe).merge(
      "lock_version" => recipe.lock_version,
      "ingredients" => recipe.recipe_ingredients.map { |row| ingredient(row) },
      "steps" => recipe.steps.map { |step| { "id" => step.id, "position" => step.position, "body" => step.body } },
      "variations" => recipe.visible_variations.map { |variation| variation(variation) }
    )
  end

  # changes: removals first ("− tofu"), then additions ("+ 150 g kip"). A removal names the
  # row of the base recipe it leaves out (recipe_ingredient_id); its name is that row's.
  # Load with RecipeVariation.with_details.
  def variation(variation)
    {
      "id" => variation.id,
      "name" => variation.name,
      "notes" => variation.notes,
      "position" => variation.position,
      "lock_version" => variation.lock_version,
      "changes" => (variation.removals + variation.additions).map { |change| variation_change(change) },
      "tag_changes" => variation.tag_changes.sort_by { |change| [ change.kind_add? ? 0 : 1, change.tag.name ] }
        .map { |change| { "kind" => change.kind, "tag" => change.tag.name } }
    }
  end

  def variation_change(change)
    {
      "id" => change.id, "kind" => change.kind, "recipe_ingredient_id" => change.recipe_ingredient_id,
      "name" => change.ingredient_name, "quantity" => number(change.quantity), "unit" => change.unit
    }
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
