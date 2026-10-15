# One line of the shopping list, as the API sends it. Shared by the shopping list itself
# and "op lijst" for a recipe or a variation (AddsToShoppingList).
module ShoppingListItemSerializer
  module_function

  def item(item)
    item.slice("id", "name", "unit", "source_label", "recipe_id", "checked")
      .merge("quantity" => RecipeSerializer.number(item.quantity))
  end
end
