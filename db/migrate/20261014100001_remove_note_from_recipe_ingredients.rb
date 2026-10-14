class RemoveNoteFromRecipeIngredients < ActiveRecord::Migration[8.1]
  # With the type, db:rollback can add the column back (empty: the notes themselves are gone).
  def change
    remove_column :recipe_ingredients, :note, :string
  end
end
