require "test_helper"

class RecipeIngredientTest < ActiveSupport::TestCase
  setup do
    @recipe = recipes(:erwtensoep)
  end

  test "ingredient_name koppelt een bestaand ingrediënt, ongeacht hoofdletters en spaties" do
    row = @recipe.recipe_ingredients.build(ingredient_name: "  BLOEM ", quantity: 100, unit: "g")

    assert_no_difference("Ingredient.count") { row.save! }
    assert_equal ingredients(:bloem), row.ingredient
  end

  test "ingredient_name maakt bij opslaan een nieuw, genormaliseerd ingrediënt aan" do
    row = @recipe.recipe_ingredients.build(ingredient_name: "Spliterwten  Groen", quantity: 500, unit: "g")

    assert_difference("Ingredient.count", 1) { row.save! }
    assert_equal "spliterwten groen", row.ingredient.reload.name
  end

  test "valideren alleen maakt nog geen ingrediënt aan" do
    row = @recipe.recipe_ingredients.build(ingredient_name: "knolselderij", quantity: 1, unit: "stuks")

    assert_no_difference("Ingredient.count") { assert row.valid? }
  end

  test "naam is verplicht" do
    row = @recipe.recipe_ingredients.build(ingredient_name: "  ", quantity: 1, unit: "stuks")

    assert_not row.valid?
    assert row.errors.added?(:ingredient_name, :blank)
  end

  test "hoeveelheid moet groter dan 0 zijn als hij is ingevuld" do
    assert_not row(ingredient_name: "ui", quantity: 0, unit: "stuks").valid?
    assert_not row(ingredient_name: "ui", quantity: -1, unit: "stuks").valid?
    assert_not row(ingredient_name: "ui", quantity: "veel", unit: "stuks").valid?
    assert row(ingredient_name: "ui", quantity: 0.5, unit: "stuks").valid?
  end

  test "zonder hoeveelheid is het naar smaak, en wordt de eenheid weggelaten" do
    row = @recipe.recipe_ingredients.build(ingredient_name: "peper", quantity: nil, unit: "g")

    assert row.valid?
    assert_nil row.unit
  end

  test "met hoeveelheid is een eenheid verplicht" do
    row = row(ingredient_name: "ui", quantity: 2, unit: nil)

    assert_not row.valid?
    assert row.errors.added?(:unit, :blank)
  end

  test "alleen g, ml en stuks zijn geldige eenheden" do
    %w[ g ml stuks ].each do |unit|
      assert row(ingredient_name: "ui", quantity: 1, unit: unit).valid?, unit
    end

    %w[ el tl cup oz ].each do |unit|
      row = row(ingredient_name: "ui", quantity: 1, unit: unit)
      assert_not row.valid?, unit
      assert row.errors.added?(:unit, :inclusion, value: unit)
    end
  end

  test "notitie wordt getrimd, en een lege notitie wordt nil" do
    assert_equal "fijn gesneden", RecipeIngredient.new(note: "  fijn   gesneden ").note
    assert_nil RecipeIngredient.new(note: "   ").note
  end

  test "notitie is maximaal 100 tekens" do
    row = row(ingredient_name: "ui", quantity: 1, unit: "stuks", note: "a" * 101)

    assert_not row.valid?
    assert row.errors[:note].any?
  end

  private
    # Each row on its own new recipe, so rows in one test never count as duplicates.
    def row(**attributes)
      Recipe.new.recipe_ingredients.build(**attributes)
    end
end
