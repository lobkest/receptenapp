# See DeletionRequestable: a requested deletion hides the recipe until the admin decides.
class AddDeletionRequestToRecipes < ActiveRecord::Migration[8.1]
  def change
    add_column :recipes, :deletion_requested_at, :datetime
    add_column :recipes, :deletion_reason, :string
    add_index :recipes, :deletion_requested_at
  end
end
