class AddStatusToRecipes < ActiveRecord::Migration[8.1]
  def change
    add_column :recipes, :status, :string, null: false, default: "pending"
    add_index :recipes, :status

    # Existing recipes were published before moderation existed; keep them visible.
    up_only { execute "UPDATE recipes SET status = 'approved'" }
  end
end
