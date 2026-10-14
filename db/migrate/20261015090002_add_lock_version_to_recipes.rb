# Optimistic locking: Rails checks and raises this number on every update of a recipe.
class AddLockVersionToRecipes < ActiveRecord::Migration[8.1]
  def change
    add_column :recipes, :lock_version, :integer, default: 0, null: false
  end
end
