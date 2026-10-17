# The one stock ("In huis"): only where it differs from the default (see PantryItem).
class CreatePantryItems < ActiveRecord::Migration[8.1]
  def change
    create_table :pantry_items do |t|
      t.references :ingredient, null: false, index: { unique: true }, foreign_key: { on_delete: :cascade }
      t.boolean :present, null: false

      t.timestamps
    end
  end
end
