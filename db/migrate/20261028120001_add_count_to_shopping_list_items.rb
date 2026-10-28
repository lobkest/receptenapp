# How many of a line you want: 1 to 99, set with the stepper on the shopping list ([−] 2 [+])
# and raised by a tap on the standard list. A multiplier: "100 g yoghurt" with count 2 is
# 200 g. standard_count stays, but only says whether the line has a standard part (> 0).
#
# Existing lines keep what they showed: a standard line "melk ×3" gets count 3; a recipe line
# with a standard part ("200 ml melk +1") counts the recipe once plus each standard tap.
class AddCountToShoppingListItems < ActiveRecord::Migration[8.1]
  def change
    add_column :shopping_list_items, :count, :integer, default: 1, null: false
    add_check_constraint :shopping_list_items, "count BETWEEN 1 AND 99",
      name: "shopping_list_items_count_range"

    reversible do |direction|
      direction.up do
        execute <<~SQL
          UPDATE shopping_list_items
          SET count = LEAST(GREATEST(
            CASE WHEN recipe_id IS NULL AND source_label = 'standaard' THEN standard_count
                 ELSE 1 + standard_count END, 1), 99)
        SQL
      end
    end
  end
end
