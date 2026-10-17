# Links the lines already on the shopping list to an ingredient with the same name,
# normalized like Ingredient#name (squish, downcase). Lines are stored that way already;
# normalizing here as well costs nothing. Plain SQL, idempotent: only lines without one.
class LinkShoppingListItemsToIngredients < ActiveRecord::Migration[8.1]
  def up
    count = connection.exec_update(<<~SQL.squish)
      UPDATE shopping_list_items SET ingredient_id = ingredients.id
      FROM ingredients
      WHERE shopping_list_items.ingredient_id IS NULL
        AND ingredients.name = lower(regexp_replace(btrim(shopping_list_items.name), '\\s+', ' ', 'g'))
    SQL
    say "#{count} lijstitems gekoppeld aan een ingrediënt"
  end

  # The links do no harm; rolling back further removes the column.
  def down
  end
end
