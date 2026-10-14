class CreateRecipeTags < ActiveRecord::Migration[8.1]
  def change
    create_table :recipe_tags do |t|
      # No separate recipe_id index: the unique index below starts with recipe_id.
      t.references :recipe, null: false, foreign_key: true, index: false
      # tag_id has its own index: the tag filter and /api/tags look rows up by tag.
      t.references :tag, null: false, foreign_key: true
      t.timestamps
    end

    add_index :recipe_tags, [ :recipe_id, :tag_id ], unique: true
  end
end
