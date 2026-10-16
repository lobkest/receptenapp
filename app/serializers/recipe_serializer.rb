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
  # nutrition: worked out now (Nutrition), for the recipe and for each variation.
  def detail(recipe)
    variations = recipe.visible_variations
    added = Ingredient.includes(:nevo_food).where(name: variations.flat_map { |variation| variation.additions.map(&:name) }).index_by(&:name)

    summary(recipe).merge(
      "lock_version" => recipe.lock_version,
      "ingredients" => recipe.recipe_ingredients.map { |row| ingredient(row) },
      "steps" => recipe.steps.map { |step| { "id" => step.id, "position" => step.position, "body" => step.body } },
      "variations" => variations.map { |variation| variation(variation, recipe: recipe, ingredients: added) },
      "nutrition" => Nutrition.for_recipe(recipe).to_h
    )
  end

  # changes: removals first ("− tofu"), then additions ("+ 150 g kip"). A removal names the
  # row of the base recipe it leaves out (recipe_ingredient_id); its name is that row's.
  # Load with RecipeVariation.with_details. recipe and ingredients: see Nutrition.for_variation.
  def variation(variation, recipe: nil, ingredients: nil)
    {
      "id" => variation.id,
      "name" => variation.name,
      "notes" => variation.notes,
      "position" => variation.position,
      "lock_version" => variation.lock_version,
      "changes" => (variation.removals + variation.additions).map { |change| variation_change(change) },
      "tag_changes" => variation.tag_changes.sort_by { |change| [ change.kind_add? ? 0 : 1, change.tag.name ] }
        .map { |change| { "kind" => change.kind, "tag" => change.tag.name } },
      "nutrition" => Nutrition.for_variation(variation, recipe: recipe, ingredients: ingredients).to_h
    }
  end

  def variation_change(change)
    {
      "id" => change.id, "kind" => change.kind, "recipe_ingredient_id" => change.recipe_ingredient_id,
      "name" => change.ingredient_name, "quantity" => number(change.quantity), "unit" => change.unit
    }
  end

  def ingredient(row)
    { "id" => row.id, "name" => row.ingredient_name, "quantity" => number(row.quantity), "unit" => row.unit, "optional" => row.optional,
      "alternatives" => row.alternatives.map { |alternative| alternative(alternative) } }
  end

  # quantity and unit: as stored, null for "zelfde als origineel" (what the edit form
  # shows). effective_quantity and effective_unit: what to use, the row's own when null.
  def alternative(alternative)
    {
      "id" => alternative.id, "name" => alternative.ingredient_name,
      "quantity" => number(alternative.quantity), "unit" => alternative.unit,
      "effective_quantity" => number(alternative.effective_quantity), "effective_unit" => alternative.effective_unit
    }
  end

  # Rails turns a BigDecimal into the string "200.0"; the API sends the number 200 or 0.5.
  def number(decimal)
    return if decimal.nil?

    decimal == decimal.to_i ? decimal.to_i : decimal.to_f
  end
end
