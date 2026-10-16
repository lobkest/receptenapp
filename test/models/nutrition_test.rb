require "test_helper"

# Pannenkoeken (4 porties): 250 g bloem, 500 ml melk, 2 stuks ei, zout (optional).
# Fixtures: bloem 350 kcal per 100 g, ei 130 kcal per 100 g and 50 g per stuk; melk is
# linked but has no gram per ml, so it does not count yet.
# Rows are changed with update_columns: a row saved on its own (not through its recipe)
# would not find itself in recipe.recipe_ingredients and count as a double.
class NutritionTest < ActiveSupport::TestCase
  setup do
    @recipe = recipes(:pannenkoeken)
  end

  def nutrition
    Nutrition.for_recipe(Recipe.with_details.find(@recipe.id))
  end

  test "sums the counted lines, for the whole recipe and per serving" do
    result = nutrition

    # bloem 250 g: 875 kcal; ei 2 × 50 g = 100 g: 130 kcal.
    assert_equal 1005, result.total["kcal"]
    assert_equal 37, result.total["protein"]
    assert_equal BigDecimal("251.25"), result.per_serving["kcal"]
    assert_equal 251.3, result.to_h["per_serving"]["kcal"]
    assert_equal 2, result.to_h["counted"]
  end

  test "per serving stays the same when the recipe makes more servings; the total scales" do
    before = nutrition.per_serving["kcal"]
    @recipe.update!(servings: 2)

    assert_equal 1005, nutrition.total["kcal"]
    assert_equal before * 2, nutrition.per_serving["kcal"]
    assert_equal 2, nutrition.to_h["servings"]
  end

  test "lines that do not count are named with the reason" do
    @recipe.recipe_ingredients.create!(ingredient: ingredients(:ongebruikt), quantity: nil, unit: nil)
    @recipe.recipe_ingredients.create!(ingredient_name: "rozijnen", quantity: 50, unit: "g")
    ingredients(:ei).update!(grams_per_piece: nil)

    assert_equal [
      { "name" => "ei", "reason" => "gram per stuk ontbreekt" },
      { "name" => "melk", "reason" => "gram per ml ontbreekt" },
      { "name" => "rozijnen", "reason" => "niet gekoppeld" },
      { "name" => "saffraan", "reason" => "geen hoeveelheid" },
      { "name" => "zout", "reason" => "optioneel" }
    ], nutrition.to_h["not_counted"].sort_by { |line| line["name"] }
    assert_equal 875, nutrition.total["kcal"]
  end

  test "ml, tl and el count through gram per ml; there is no default density" do
    ingredients(:melk).update!(grams_per_ml: "1,03")
    # 500 ml × 1.03 = 515 g × 50 kcal / 100.
    assert_equal BigDecimal("257.5"), nutrition.total["kcal"] - 1005

    recipe_ingredients(:pannenkoeken_melk).update_columns(quantity: 2, unit: "el")
    # 2 el = 30 ml × 1.03 = 30.9 g.
    assert_equal BigDecimal("15.45"), nutrition.total["kcal"] - 1005
  end

  test "a NEVO product per 100 ml counts ml directly, and g through gram per ml" do
    ingredients(:melk).update!(nevo_food: nevo_foods(:drinkvoeding))
    assert_equal 350, nutrition.total["kcal"] - 1005

    recipe_ingredients(:pannenkoeken_melk).update_columns(quantity: 200, unit: "g")
    assert_includes nutrition.to_h["not_counted"], { "name" => "melk", "reason" => "gram per ml ontbreekt" }
    ingredients(:melk).update!(grams_per_ml: 2)
    assert_equal 70, nutrition.total["kcal"] - 1005
  end

  test "a label value wins over NEVO, per nutrient, and is named as the source" do
    ingredients(:bloem).update!(label_kcal: 400)
    result = nutrition.to_h

    assert_equal 1130, result["total"]["kcal"]
    # Protein still from NEVO: 25 + 12.
    assert_equal 37, result["total"]["protein"]
    assert_equal [ { "name" => "bloem", "source" => "nevo en etiket" }, { "name" => "ei", "source" => "nevo" } ],
      result["sources"].sort_by { |line| line["name"] }
    assert result["label_values"]
  end

  test "an ingredient with only label values counts, also without a NEVO link" do
    ingredients(:zout).update!(label_kcal: 0, label_protein: 0)
    recipe_ingredients(:pannenkoeken_zout).update_columns(optional: false, quantity: 5, unit: "g")
    result = nutrition.to_h

    assert_equal 3, result["counted"]
    assert_includes result["sources"], { "name" => "zout", "source" => "etiket" }
    assert_equal [ "zout" ], result["unknown"]["fat"]
  end

  test "an unknown NEVO value leaves the line out of that nutrient only" do
    result = nutrition.to_h

    # Fiber of the egg is unknown: only the flour's 10 g.
    assert_equal 10, result["total"]["fiber"]
    assert_equal({ "fiber" => [ "ei" ] }, result["unknown"])
  end

  test "nothing counted: totals are nil" do
    Ingredient.update_all(nevo_food_id: nil)
    result = nutrition.to_h

    assert_equal 0, result["counted"]
    assert_nil result["total"]["kcal"]
    assert_empty result["nevo_versions"]
  end

  test "the NEVO version for the citation" do
    assert_equal [ "2025/9.0" ], nutrition.to_h["nevo_versions"]
    refute nutrition.to_h["label_values"]
  end

  test "a variation: the base without the removed rows, plus the added ones by ingredient name" do
    variation = recipe_variations(:spek)
    # Removes melk (did not count anyway), adds 100 g spek: no ingredient spek yet.
    result = Nutrition.for_variation(variation).to_h
    assert_equal 1005, result["total"]["kcal"]
    assert_includes result["not_counted"], { "name" => "spek", "reason" => "niet gekoppeld" }
    refute_includes result["not_counted"].map { |line| line["name"] }, "melk"

    Ingredient.create!(name: "spek", label_kcal: 500)
    assert_equal 1505, Nutrition.for_variation(variation).total["kcal"]
  end
end
