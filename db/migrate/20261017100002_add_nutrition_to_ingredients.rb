# Nutrition per ingredient: a link to a NEVO product, conversions to grams for stuks and
# ml (tl and el go through ml), and the person's own label values per 100 g, which win
# over NEVO per nutrient. needs_review: linked by nevo:auto_link, still to be checked.
# lock_version: anyone may edit, like recipes.
class AddNutritionToIngredients < ActiveRecord::Migration[8.1]
  def change
    # nullify: a NEVO product that is ever deleted leaves the ingredient unlinked.
    add_reference :ingredients, :nevo_food, foreign_key: { on_delete: :nullify }
    add_column :ingredients, :grams_per_piece, :decimal, precision: 10, scale: 2
    add_column :ingredients, :grams_per_ml, :decimal, precision: 10, scale: 3
    %i[ kcal protein carbohydrates fat fiber ].each do |nutrient|
      add_column :ingredients, :"label_#{nutrient}", :decimal, precision: 10, scale: 2
    end
    add_column :ingredients, :needs_review, :boolean, default: false, null: false
    add_column :ingredients, :lock_version, :integer, default: 0, null: false

    add_check_constraint :ingredients, "grams_per_piece > 0", name: "ingredients_grams_per_piece_positive"
    add_check_constraint :ingredients, "grams_per_ml > 0", name: "ingredients_grams_per_ml_positive"
  end
end
