# A full copy of a recipe (with ingredients, steps and tags) after every change.
class CreateRecipeVersions < ActiveRecord::Migration[8.1]
  def change
    create_table :recipe_versions do |t|
      # Deleting a recipe for good also deletes its history.
      t.references :recipe, null: false, foreign_key: { on_delete: :cascade }
      t.jsonb :snapshot, null: false
      t.string :summary, null: false
      t.datetime :created_at, null: false
    end
  end
end
