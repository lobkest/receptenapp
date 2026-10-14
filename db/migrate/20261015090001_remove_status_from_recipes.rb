# Recipes no longer need approval: every recipe is visible. Removing the column makes the
# pending and rejected ones visible too (that is the data migration).
class RemoveStatusFromRecipes < ActiveRecord::Migration[8.1]
  def up
    remove_index :recipes, :status
    remove_column :recipes, :status
  end

  # Back to the old model. Which recipes were pending or rejected is gone, and all of
  # them were visible, so on the way back every recipe counts as approved.
  def down
    add_column :recipes, :status, :string, default: "pending", null: false
    execute "UPDATE recipes SET status = 'approved'"
    add_index :recipes, :status
  end
end
