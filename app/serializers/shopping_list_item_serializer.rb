# One line of the shopping list, as the API sends it. Shared by the shopping list itself
# and "op lijst" for a recipe or a variation (AddsToShoppingList).
module ShoppingListItemSerializer
  module_function

  # ingredient_id: the linked ingredient, or nil (ticking it off puts it in the house).
  # standard_count: how many times it was added from the standard list (0: never).
  # recipe_title: the recipe's current name, for "Recepten op je lijst" and grouping per
  # recipe (source_label of a variation is "Pannenkoeken (variatie: …)"); nil without a recipe.
  # recipe_visible: false when its deletion was requested; the list then shows no link.
  def item(item)
    item.slice("id", "name", "unit", "source_label", "recipe_id", "ingredient_id", "checked", "standard_count")
      .merge("quantity" => RecipeSerializer.number(item.quantity),
        "recipe_title" => item.recipe&.title, "recipe_visible" => item.recipe.present? && !item.recipe.deletion_requested?)
  end

  # Several lines with their recipes in one query, not one per line.
  def items(items)
    ActiveRecord::Associations::Preloader.new(records: items, associations: :recipe).call
    items.map { |item| item(item) }
  end
end
