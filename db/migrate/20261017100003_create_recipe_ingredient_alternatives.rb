# An alternative for one ingredient row of a recipe: "of: 200 g tofu" next to "250 g kip".
# The recipe page can swap the row for it. NULL quantity and unit mean "the same as the
# original row", so a change to the original amount also counts for the alternative.
class CreateRecipeIngredientAlternatives < ActiveRecord::Migration[8.1]
  def change
    create_table :recipe_ingredient_alternatives do |t|
      # No separate index: the unique index below starts with recipe_ingredient_id.
      # Deleting the row also deletes its alternatives (restoring a version does that).
      t.references :recipe_ingredient, null: false, foreign_key: { on_delete: :cascade }, index: false
      t.references :ingredient, null: false, foreign_key: true
      t.decimal :quantity, precision: 10, scale: 2
      t.string :unit
      t.integer :position, null: false, default: 0
      t.timestamps
    end

    # The same alternative only once per row.
    add_index :recipe_ingredient_alternatives, [ :recipe_ingredient_id, :ingredient_id ], unique: true,
      name: "index_recipe_ingredient_alternatives_on_row_and_ingredient"

    # The same rules as recipe_ingredients.
    add_check_constraint :recipe_ingredient_alternatives, "(quantity IS NULL) = (unit IS NULL)",
      name: "recipe_ingredient_alternatives_quantity_has_unit"
    add_check_constraint :recipe_ingredient_alternatives, "quantity > 0",
      name: "recipe_ingredient_alternatives_quantity_positive"
    add_check_constraint :recipe_ingredient_alternatives, "unit IN ('g', 'ml', 'stuks', 'tl', 'el')",
      name: "recipe_ingredient_alternatives_unit_known"
  end
end
