# Basisvoorraad: zout, olijfolie, ... are in the house unless someone says they are out
# (PantryItem). Separate from negligible, which is about the nutrition.
class AddStapleToIngredients < ActiveRecord::Migration[8.1]
  def change
    add_column :ingredients, :staple, :boolean, default: false, null: false
  end
end
