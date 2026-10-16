# A property of an ingredient that some tags exclude: vlees, vis, dierlijk, gluten,
# lactose. Ingredients get them through ingredient_traits; tags exclude them through
# tag_exclusions. The first five are added by AddAutomaticTags.
class CreateTraits < ActiveRecord::Migration[8.1]
  def change
    create_table :traits do |t|
      t.string :name, null: false
      t.timestamps
    end

    add_index :traits, :name, unique: true
  end
end
