class CreateShoppingListItems < ActiveRecord::Migration[8.1]
  def change
    # One shared list, so no shopping_lists table: every row is on "the" list.
    create_table :shopping_list_items do |t|
      t.string :name, null: false
      t.decimal :quantity, precision: 10, scale: 2 # NULL means "naar smaak" or "just buy it"
      t.string :unit
      t.string :source_label # "Pannenkoeken" or "standaard"
      # Deleting a recipe keeps its rows on the list; only the link disappears.
      t.references :recipe, foreign_key: { on_delete: :nullify }
      t.boolean :checked, default: false, null: false
      t.timestamps
    end
  end
end
