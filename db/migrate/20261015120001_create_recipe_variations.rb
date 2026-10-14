# A variation on a recipe ("met kip in plaats van tofu"). Its changes are in
# variation_changes and variation_tag_changes; the recipe itself stays as it is.
class CreateRecipeVariations < ActiveRecord::Migration[8.1]
  def change
    create_table :recipe_variations do |t|
      # Deleting a recipe for good also deletes its variations.
      t.references :recipe, null: false, foreign_key: { on_delete: :cascade }
      t.string :name, null: false
      t.text :notes
      t.integer :position, null: false
      # Optimistic locking, as on recipes.
      t.integer :lock_version, default: 0, null: false
      # See DeletionRequestable.
      t.datetime :deletion_requested_at
      t.string :deletion_reason
      t.timestamps
    end

    add_index :recipe_variations, :deletion_requested_at
  end
end
