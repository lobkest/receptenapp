# The same rules as recipe_ingredients and variation_changes: a quantity is positive, has
# a known unit, and a unit means nothing without a quantity ("zout", "wc-papier").
#
# The model has always checked this, so existing rows should already fit. To be safe, rows
# that do not are repaired first, never deleted: their amount is dropped and they stay on
# the list by name ("naar smaak"), which is what you would still want to buy. That repair
# is not undone on rollback; the constraints are.
class AddCheckConstraintsToShoppingListItems < ActiveRecord::Migration[8.1]
  UNITS = "('g', 'ml', 'stuks')"

  def change
    reversible do |direction|
      direction.up { repair_rows }
    end

    add_check_constraint :shopping_list_items, "quantity > 0", name: "shopping_list_items_quantity_positive"
    add_check_constraint :shopping_list_items, "unit IN #{UNITS}", name: "shopping_list_items_unit_known"
    add_check_constraint :shopping_list_items, "(quantity IS NULL) = (unit IS NULL)",
      name: "shopping_list_items_quantity_has_unit"
  end

  private
    def repair_rows
      repaired = update(<<~SQL)
        UPDATE shopping_list_items SET quantity = NULL, unit = NULL
        WHERE quantity <= 0
           OR (unit IS NOT NULL AND unit NOT IN #{UNITS})
           OR (quantity IS NULL) <> (unit IS NULL)
      SQL
      say "#{repaired} shopping list item(s) set to naar smaak", true
    end
end
