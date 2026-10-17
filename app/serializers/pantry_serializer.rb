# The JSON shapes for "In huis" (see RecipeSerializer for why explicit).
module PantrySerializer
  module_function

  # in_house: what else is in the house (not a staple). staples: every staple, present
  # false when it is out ("op"). suggestions: quick picks, not in the house yet.
  def pantry(in_house:, staples:, suggestions:)
    {
      "in_house" => in_house.map { |ingredient| { "id" => ingredient.id, "name" => ingredient.name } },
      "staples" => staples.map { |ingredient| { "id" => ingredient.id, "name" => ingredient.name, "present" => ingredient.in_house? } },
      "suggestions" => suggestions.map { |id, name| { "id" => id, "name" => name } }
    }
  end

  # Three groups, always in this order: everything in the house, 1 missing, 2 missing.
  def recipes(results)
    grouped = results.group_by { |result| result.missing.size }
    (0..PantryMatcher::MAX_MISSING).map do |count|
      { "missing_count" => count, "recipes" => grouped.fetch(count, []).map { |result| recipe(result) } }
    end
  end

  # servings: the recipe's own number, for "Ontbrekende op lijst".
  def recipe(result)
    recipe = result.recipe
    {
      "id" => recipe.id,
      "title" => recipe.title,
      "servings" => recipe.servings,
      "category" => recipe.category && RecipeSerializer.category(recipe.category),
      "missing" => result.missing.map { |missing| { "id" => missing.id, "name" => missing.name } }
    }
  end
end
