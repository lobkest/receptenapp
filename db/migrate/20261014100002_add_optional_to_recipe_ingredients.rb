class AddOptionalToRecipeIngredients < ActiveRecord::Migration[8.1]
  def change
    # Existing rows get false: every ingredient so far was a required one.
    add_column :recipe_ingredients, :optional, :boolean, default: false, null: false
  end
end
