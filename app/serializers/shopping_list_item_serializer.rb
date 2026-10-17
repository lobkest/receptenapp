# One line of the shopping list, as the API sends it. Shared by the shopping list itself
# and "op lijst" for a recipe or a variation (AddsToShoppingList).
module ShoppingListItemSerializer
  module_function

  # ingredient_id: the linked ingredient, or nil (ticking it off puts it in the house).
  # standard_count: how many times it was added from the standard list (0: never).
  def item(item)
    item.slice("id", "name", "unit", "source_label", "recipe_id", "ingredient_id", "checked", "standard_count")
      .merge("quantity" => RecipeSerializer.number(item.quantity))
  end
end
