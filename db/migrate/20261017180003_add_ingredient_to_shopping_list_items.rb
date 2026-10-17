# A shopping list line can know its ingredient, so ticking it off puts it in the house.
# pantry_changed: ticking it off really changed the stock, so unticking may undo that.
class AddIngredientToShoppingListItems < ActiveRecord::Migration[8.1]
  def change
    add_reference :shopping_list_items, :ingredient, foreign_key: { on_delete: :nullify }
    add_column :shopping_list_items, :pantry_changed, :boolean, default: false, null: false
  end
end
