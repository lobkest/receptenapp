# How many times a line was added from the standard list ("melk ×2", "melk 200 ml +1"). A
# separate counter, not quantity: quantity means grams or millilitres.
#
# Lines that came from the standard list before this column existed count once.
class AddStandardCountToShoppingListItems < ActiveRecord::Migration[8.1]
  def change
    add_column :shopping_list_items, :standard_count, :integer, default: 0, null: false
    add_check_constraint :shopping_list_items, "standard_count >= 0",
      name: "shopping_list_items_standard_count_not_negative"

    reversible do |direction|
      direction.up do
        execute <<~SQL
          UPDATE shopping_list_items SET standard_count = 1
          WHERE recipe_id IS NULL AND source_label = 'standaard'
        SQL
      end
    end
  end
end
