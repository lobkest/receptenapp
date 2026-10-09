class CreateRecipes < ActiveRecord::Migration[8.1]
  def change
    create_table :recipes do |t|
      t.string :title, null: false
      t.text :description
      t.integer :servings, null: false, default: 4
      t.timestamps
    end
  end
end
