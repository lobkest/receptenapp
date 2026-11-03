# Everything the app shows without a connection, in one answer (GET /api/offline_snapshot):
# every visible recipe in full (ingredients, steps, tags, category, variations, alternatives
# and nutrition, as /api/recipes/:id sends it), the tags and categories for the filter, the
# ingredient names (suggestions, matching by name), the standard list and the stock.
# The browser keeps it in IndexedDB; the database stays the source of truth.
#
# Not the shopping list: that has its own copy (GET /api/shopping_list_items) and changes
# with every tick in the shop, which would make the browser download all recipes again.
#
# Per-ingredient nutrition comes with each recipe ("nutrition" => "lines", with every
# alternative), so scaling and swapping work offline without the NEVO table.
#
# Not a table: like ShoppingListAddition, a plain class the controller asks.
class OfflineSnapshot
  # Every table whose rows end up in the snapshot. A change anywhere changes the ETag.
  TABLES = %w[
    recipes recipe_ingredients recipe_ingredient_alternatives steps recipe_tags tags
    categories recipe_variations variation_changes variation_tag_changes ingredients
    ingredient_traits traits tag_exclusions nevo_foods pantry_items standard_items
  ].freeze

  # What makes the ETag: per table how many rows and the latest updated_at, in one query.
  # A new, changed or deleted row changes one of them. Cheap compared to building the
  # snapshot, so an unchanged snapshot costs one query and a 304.
  def self.version
    sql = TABLES.map { |table|
      "SELECT '#{table}' AS name, COUNT(*) AS rows, MAX(updated_at) AS latest FROM #{table}"
    }.join(" UNION ALL ")
    ActiveRecord::Base.connection.select_rows(sql).map { |name, rows, latest| "#{name}:#{rows}:#{latest}" }.join("|")
  end

  def self.to_h
    evaluator = RecipeTagEvaluator.load
    {
      "recipes" => Recipe.visible.with_details.order(:id).map { |recipe| RecipeSerializer.detail(recipe, evaluator: evaluator) },
      "tags" => Tag.counts(evaluator),
      "categories" => Category.ordered.map { |category| RecipeSerializer.category(category) },
      "ingredients" => Ingredient.order(:name).pluck(:id, :name).map { |id, name| { "id" => id, "name" => name } },
      "standard_items" => StandardItem.order(:name).map { |item| StandardItem.serialize(item) },
      "pantry" => PantrySerializer.pantry(**PantryItem.overview)
    }
  end
end
