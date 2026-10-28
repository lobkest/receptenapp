# The JSON shapes of the API, written out explicitly. Adding or renaming a column
# never changes what clients receive by accident.
module RecipeSerializer
  SUMMARY_FIELDS = %w[ id title description servings created_at updated_at ].freeze

  module_function

  # For lists: no ingredients or steps. Load with includes(:tags, :category) and
  # RecipeTagEvaluator::PRELOAD to avoid one query per recipe. category is null for a
  # recipe without one ("Overig").
  # tags: the tags set by hand. automatic_tags: the automatic ones that pass ("ja" or
  # "met_wissel"), worked out now; see automatic_tag. A list passes one evaluator for all.
  def summary(recipe, evaluator: RecipeTagEvaluator.load)
    recipe.slice(*SUMMARY_FIELDS).merge(
      "tags" => manual_tag_names(recipe.tags, evaluator),
      "automatic_tags" => automatic_tags(evaluator.for_recipe(recipe)),
      "category" => recipe.category && category(recipe.category)
    )
  end

  # Before the one-off traits:setup a recipe can still have an automatic tag by hand; it
  # does not count.
  def manual_tag_names(tags, evaluator)
    tags.map(&:name).reject { |name| evaluator.automatic?(name) }.sort
  end

  def automatic_tags(results)
    results.select(&:passes?).map { |result| automatic_tag(result) }
  end

  # { name: "vegetarisch", status: "met_wissel", disclaimer: false,
  #   swaps: [ { recipe_ingredient_id: 12, ingredient: "kip", alternatives: [ { id: 3, name: "tofu" } ] } ],
  #   without: [ { recipe_ingredient_id: 14, ingredient: "spekjes", alternative_ids: [] } ] }
  # swaps: rows that need one of these alternatives ("met tofu i.p.v. kip"); without:
  # optional rows that are left out ("zonder spekjes"), or swapped for an ok alternative.
  # disclaimer: based on our own ingredient data for gluten, lactose or noten.
  def automatic_tag(result)
    {
      "name" => result.name,
      "status" => result.status,
      "disclaimer" => result.disclaimer,
      "swaps" => result.swaps.map { |swap|
        { "recipe_ingredient_id" => swap.recipe_ingredient_id, "ingredient" => swap.ingredient,
          "alternatives" => swap.alternatives.map { |option| { "id" => option.id, "name" => option.name } } }
      },
      "without" => result.without.map { |skip|
        { "recipe_ingredient_id" => skip.recipe_ingredient_id, "ingredient" => skip.ingredient, "alternative_ids" => skip.alternative_ids }
      }
    }
  end

  # A summary with what "Met ingrediënt…" found (IngredientSearch::Result):
  # "ingredient_match" => {
  #   "matches" => [ { "ingredient_id" => 12, "name" => "courgette", "via" => "alternative",
  #     "swap" => { "recipe_ingredient_id" => 5, "alternative_id" => 3, "ingredient" => "aubergine", "alternative" => "courgette" } } ],
  #   "missing" => [ { "id" => 7, "name" => "feta" } ], "missing_count" => 1 }
  # via: "original", "alternative" or "optional". swap: only when the chosen ingredient is
  # an alternative ("met courgette i.p.v. aubergine"), else null. missing: the rows still
  # to buy, by row id (for "Ontbrekende op lijst") and the original's name, like "In huis".
  def search_result(result, evaluator:)
    summary(result.recipe, evaluator: evaluator).merge(
      "ingredient_match" => {
        "matches" => result.matches.map { |match| ingredient_match(match) },
        "missing" => result.missing.map { |missing| { "id" => missing.id, "name" => missing.name } },
        "missing_count" => result.missing.size
      }
    )
  end

  def ingredient_match(match)
    swap = match.alternative && {
      "recipe_ingredient_id" => match.row.id, "alternative_id" => match.alternative.id,
      "ingredient" => match.row.ingredient_name, "alternative" => match.alternative.ingredient_name
    }
    name = (match.alternative || match.row).ingredient_name

    { "ingredient_id" => match.ingredient_id, "name" => name, "via" => match.via, "swap" => swap }
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
  def detail(recipe, evaluator: RecipeTagEvaluator.load)
    variations = recipe.visible_variations
    added = Ingredient.for_additions(variations)

    summary(recipe, evaluator: evaluator).merge(
      "lock_version" => recipe.lock_version,
      "ingredients" => recipe.recipe_ingredients.map { |row| ingredient(row) },
      "steps" => recipe.steps.map { |step| { "id" => step.id, "position" => step.position, "body" => step.body } },
      "variations" => variations.map { |variation| variation(variation, recipe: recipe, ingredients: added, evaluator: evaluator) },
      "nutrition" => Nutrition.for_recipe(recipe).to_h
    )
  end

  # changes: removals first ("− tofu"), then additions ("+ 150 g kip"). A removal names the
  # row of the base recipe it leaves out (recipe_ingredient_id); its name is that row's.
  # Load with RecipeVariation.with_details. recipe and ingredients: see Nutrition.for_variation.
  # tag_changes: the ones set by hand, and the automatic tags the variation gains or loses
  # compared with the base recipe ("automatic": true; "− vegetarisch" with + kip).
  # automatic_tags: like a recipe's, for the variation as a whole.
  def variation(variation, recipe: nil, ingredients: nil, evaluator: RecipeTagEvaluator.load)
    recipe ||= variation.recipe
    ingredients ||= Ingredient.for_additions([ variation ])
    manual = variation.tag_changes.reject { |change| evaluator.automatic?(change.tag.name) }
      .map { |change| { "kind" => change.kind, "tag" => change.tag.name } }
    automatic = evaluator.variation_changes(variation, recipe: recipe, ingredients: ingredients)
      .map { |kind, name| { "kind" => kind, "tag" => name, "automatic" => true } }

    {
      "id" => variation.id,
      "name" => variation.name,
      "notes" => variation.notes,
      "position" => variation.position,
      "lock_version" => variation.lock_version,
      "changes" => (variation.removals + variation.additions).map { |change| variation_change(change) },
      "tag_changes" => (manual + automatic).sort_by { |change| [ change["kind"] == "add" ? 0 : 1, change["tag"] ] },
      "automatic_tags" => automatic_tags(evaluator.for_variation(variation, recipe: recipe, ingredients: ingredients)),
      "nutrition" => Nutrition.for_variation(variation, recipe: recipe, ingredients: ingredients).to_h
    }
  end

  def variation_change(change)
    {
      "id" => change.id, "kind" => change.kind, "recipe_ingredient_id" => change.recipe_ingredient_id,
      "name" => change.ingredient_name, "quantity" => number(change.quantity), "unit" => change.unit
    }
  end

  # ingredient_id: so the recipe page can see whether the ingredient is on the shopping list.
  def ingredient(row)
    { "id" => row.id, "ingredient_id" => row.ingredient_id, "name" => row.ingredient_name, "quantity" => number(row.quantity), "unit" => row.unit, "optional" => row.optional,
      "alternatives" => row.alternatives.map { |alternative| alternative(alternative) } }
  end

  # quantity and unit: as stored, null for "zelfde als origineel" (what the edit form
  # shows). effective_quantity and effective_unit: what to use, the row's own when null.
  def alternative(alternative)
    {
      "id" => alternative.id, "ingredient_id" => alternative.ingredient_id, "name" => alternative.ingredient_name,
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
