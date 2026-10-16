# Categories ("Ontbijt", "Diner"): one per recipe at most, separate from tags.
class CreateCategories < ActiveRecord::Migration[8.1]
  def change
    create_table :categories do |t|
      t.string :name, null: false
      t.integer :position, null: false
      t.timestamps
    end
    # Names keep their capitals ("Ontbijt"), so the index compares them in lower case.
    add_index :categories, "lower(name)", unique: true, name: "index_categories_on_lower_name"

    # Optional: a recipe without a category is shown under "Overig".
    add_reference :recipes, :category, null: true, foreign_key: true
  end
end
