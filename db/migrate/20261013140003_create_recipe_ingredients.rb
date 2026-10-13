class CreateRecipeIngredients < ActiveRecord::Migration[8.1]
  def change
    create_table :recipe_ingredients do |t|
      # No separate recipe_id index: the unique index below starts with recipe_id.
      t.references :recipe, null: false, foreign_key: true, index: false
      t.references :ingredient, null: false, foreign_key: true
      t.decimal :quantity, precision: 10, scale: 2 # NULL means "naar smaak"
      t.string :unit
      t.string :note
      t.timestamps
    end

    add_index :recipe_ingredients, [ :recipe_id, :ingredient_id ], unique: true
    add_check_constraint :recipe_ingredients, "quantity > 0", name: "recipe_ingredients_quantity_positive"
    add_check_constraint :recipe_ingredients, "unit IN ('g', 'ml', 'stuks')", name: "recipe_ingredients_unit_known"
    add_check_constraint :recipe_ingredients, "(quantity IS NULL) = (unit IS NULL)",
      name: "recipe_ingredients_quantity_has_unit"
  end
end
