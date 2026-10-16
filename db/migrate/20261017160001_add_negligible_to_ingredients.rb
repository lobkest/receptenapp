# "Verwaarloosbaar": an ingredient used in amounts too small to matter (bakpoeder, specerijen).
# It counts as 0 for every nutrient instead of "niet meegeteld"; no made-up label values.
class AddNegligibleToIngredients < ActiveRecord::Migration[8.1]
  def change
    add_column :ingredients, :negligible, :boolean, default: false, null: false
  end
end
