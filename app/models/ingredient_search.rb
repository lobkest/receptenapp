# "Met ingrediënt…" on the recipes tab: the recipes with at least one of the chosen
# ingredients, as a row's own ingredient, as an alternative, or in an optional row.
#
#   search = IngredientSearch.new([ 12, 34 ], present_ids: PantryItem.present_ingredient_ids)
#   search.results(recipes)
#   # => [ Result(recipe:, matches: [ Match(ingredient_id: 12, via: "alternative", row:, alternative:) ], missing: [ ... ]) ]
#
# missing: what you still have to buy, like "In huis" (PantryMatcher), with the chosen
# ingredients counted as in the house; no limit on how many. Best first: most chosen
# ingredients, then originals before alternatives before optional rows, then least to
# buy, then by title. Load the recipes like PantryMatcher needs them (Recipe.with_all_tags).
class IngredientSearch
  # Best first: the order of the second sort key.
  VIAS = %w[ original alternative optional ].freeze

  # via: "original", "alternative" or "optional" (an optional row, with its own ingredient
  # or an alternative). row: the RecipeIngredient; alternative: the one to swap in, or nil.
  Match = Data.define(:ingredient_id, :via, :row, :alternative)
  Result = Data.define(:recipe, :matches, :missing)

  # ids: the chosen ingredient ids; present_ids: what is in the house.
  def initialize(ids, present_ids:)
    @ids = ids.uniq
    @matcher = PantryMatcher.new(present_ids | @ids)
  end

  def results(recipes)
    recipes.filter_map { |recipe| result(recipe) }.sort_by { |result| sort_key(result) }
  end

  private
    def result(recipe)
      matches = @ids.filter_map { |id| best_match(recipe, id) }
      Result.new(recipe: recipe, matches: matches, missing: @matcher.missing(recipe)) if matches.any?
    end

    # Of every row this ingredient covers, the best one.
    def best_match(recipe, id)
      recipe.recipe_ingredients.filter_map { |row| match(row, id) }.min_by { |match| VIAS.index(match.via) }
    end

    def match(row, id)
      covering = PantryMatcher.covering(row, [ id ])
      return if covering.nil?

      alternative = covering unless covering.equal?(row)
      via = if row.optional then "optional" elsif alternative then "alternative" else "original" end
      Match.new(ingredient_id: id, via: via, row: row, alternative: alternative)
    end

    # Comparing how many originals, then how many alternatives (both more is better) is
    # the same as comparing the matches from best to worst.
    def sort_key(result)
      vias = result.matches.map(&:via)
      [ -vias.size, -vias.count("original"), -vias.count("alternative"), result.missing.size,
        result.recipe.title.downcase, result.recipe.id ]
    end
end
