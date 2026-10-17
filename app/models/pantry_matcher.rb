# Which recipes can you make with what is in the house ("In huis")? Per recipe (the base
# recipe, not its variations) the rows that are missing:
# - a row is there when its own ingredient is in the house, or one of its alternatives;
# - optional rows never count, and neither do amounts (a bit of bloem is enough).
#
#   matcher = PantryMatcher.new(PantryItem.present_ingredient_ids)
#   matcher.results(recipes)  # => [ Result(recipe:, missing: [ Missing(id: 12, name: "feta") ]) ]
#
# Only recipes with at most MAX_MISSING missing rows, fewest first, then by title. A recipe
# without ingredients (an older one) says nothing, so it is left out. Load the recipes with
# RecipeTagEvaluator::PRELOAD (Recipe.with_all_tags does): rows, their alternatives and
# ingredients, so this asks the database nothing.
class PantryMatcher
  MAX_MISSING = 2

  # id: the recipe_ingredient_id ("Ontbrekende op lijst" sends it as ingredient_ids);
  # name: the row's own ingredient, never an alternative.
  Missing = Data.define(:id, :name)
  Result = Data.define(:recipe, :missing)

  # present_ids: the ingredient ids in the house (PantryItem.present_ingredient_ids).
  def initialize(present_ids)
    @present_ids = present_ids
  end

  def results(recipes)
    recipes.filter_map { |recipe| result(recipe) }
      .sort_by { |result| [ result.missing.size, result.recipe.title.downcase, result.recipe.id ] }
  end

  def missing(recipe)
    recipe.recipe_ingredients.reject { |row| row.optional || available?(row) }
      .map { |row| Missing.new(id: row.id, name: row.ingredient_name) }
  end

  private
    def result(recipe)
      return if recipe.recipe_ingredients.empty?

      missing = missing(recipe)
      Result.new(recipe: recipe, missing: missing) if missing.size <= MAX_MISSING
    end

    def available?(row)
      @present_ids.include?(row.ingredient_id) || row.alternatives.any? { |alternative| @present_ids.include?(alternative.ingredient_id) }
    end
end
