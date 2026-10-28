# One line of the shopping list, as the API sends it. Shared by the shopping list itself
# and "op lijst" for a recipe or a variation (AddsToShoppingList).
module ShoppingListItemSerializer
  module_function

  # ingredient_id: the linked ingredient, or nil (ticking it off puts it in the house).
  # count: how many, 1 to 99; a multiplier for quantity ("100 g" × 2 is 200 g).
  # standard_count: how many times it was added from the standard list (0: never).
  # recipe_title: the recipe's current name, for "Recepten op je lijst" and grouping per
  # recipe (source_label of a variation is "Pannenkoeken (variatie: …)"); nil without a recipe.
  # recipe_visible: false when its deletion was requested; the list then shows no link.
  # category: the category of the standard item with the same name ("bakken"), so the list
  # can be grouped like the shop; nil when there is none. Names are already normalized
  # (squished, lower case) on both sides. categories: name => category, see items.
  def item(item, categories = nil)
    categories ||= categories_for([ item ])
    item.slice("id", "name", "unit", "source_label", "recipe_id", "ingredient_id", "checked", "count", "standard_count")
      .merge("quantity" => RecipeSerializer.number(item.quantity),
        "recipe_title" => item.recipe&.title, "recipe_visible" => item.recipe.present? && !item.recipe.deletion_requested?,
        "category" => categories[item.name])
  end

  # Several lines with their recipes and categories in two queries, not two per line.
  def items(items)
    ActiveRecord::Associations::Preloader.new(records: items, associations: :recipe).call
    categories = categories_for(items)
    items.map { |item| item(item, categories) }
  end

  def categories_for(items)
    StandardItem.where(name: items.map(&:name).uniq).where.not(category: nil).pluck(:name, :category).to_h
  end
end
