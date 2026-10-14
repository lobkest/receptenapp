# One ingredient change in a variation: "remove" points to a row of the base recipe,
# "add" brings its own name and amount, like a recipe_ingredients row.
class CreateVariationChanges < ActiveRecord::Migration[8.1]
  def change
    create_table :variation_changes do |t|
      # No separate index: the unique index below starts with recipe_variation_id.
      t.references :recipe_variation, null: false, foreign_key: { on_delete: :cascade }, index: false
      t.string :kind, null: false
      # remove: the row of the base recipe. Deleting that row also deletes this change
      # (the cascade finds it through this column's own index).
      t.references :recipe_ingredient, foreign_key: { on_delete: :cascade }
      # add: like recipe_ingredients. NULL quantity means "naar smaak".
      t.string :name
      t.decimal :quantity, precision: 10, scale: 2
      t.string :unit
      t.timestamps
    end

    # A row can be removed only once per variation. Postgres treats NULLs as different,
    # so any number of "add" rows (recipe_ingredient_id NULL) is fine.
    add_index :variation_changes, [ :recipe_variation_id, :recipe_ingredient_id ], unique: true,
      name: "index_variation_changes_on_variation_and_recipe_ingredient"

    add_check_constraint :variation_changes, "kind IN ('add', 'remove')", name: "variation_changes_kind_known"
    add_check_constraint :variation_changes,
      "(kind = 'remove' AND recipe_ingredient_id IS NOT NULL AND name IS NULL AND quantity IS NULL AND unit IS NULL) OR " \
      "(kind = 'add' AND recipe_ingredient_id IS NULL AND name IS NOT NULL)",
      name: "variation_changes_fields_match_kind"
    # The same rules as recipe_ingredients.
    add_check_constraint :variation_changes, "(quantity IS NULL) = (unit IS NULL)", name: "variation_changes_quantity_has_unit"
    add_check_constraint :variation_changes, "quantity > 0", name: "variation_changes_quantity_positive"
    add_check_constraint :variation_changes, "unit IN ('g', 'ml', 'stuks')", name: "variation_changes_unit_known"
  end
end
