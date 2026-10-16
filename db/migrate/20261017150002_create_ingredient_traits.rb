# Which traits an ingredient has: kip has vlees and dierlijk, feta dierlijk and lactose.
class CreateIngredientTraits < ActiveRecord::Migration[8.1]
  def change
    create_table :ingredient_traits do |t|
      # No separate ingredient_id index: the unique index below starts with it.
      # Deleting the ingredient (merging) or the trait also deletes the link.
      t.references :ingredient, null: false, foreign_key: { on_delete: :cascade }, index: false
      t.references :trait, null: false, foreign_key: { on_delete: :cascade }
      t.timestamps
    end

    add_index :ingredient_traits, [ :ingredient_id, :trait_id ], unique: true
  end
end
