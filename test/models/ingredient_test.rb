require "test_helper"

class IngredientTest < ActiveSupport::TestCase
  test "naam wordt genormaliseerd: kleine letters, spaties getrimd en enkelvoudig" do
    assert_equal "verse basilicum", Ingredient.new(name: "  Verse   BASILICUM ").name
  end

  test "naam is uniek, ook met andere hoofdletters of spaties" do
    duplicate = Ingredient.new(name: " Bloem ")

    assert_not duplicate.valid?
    assert duplicate.errors.added?(:name, :taken, value: "bloem")
  end

  test "naam is verplicht en maximaal 100 tekens" do
    assert_not Ingredient.new(name: "   ").valid?
    assert_not Ingredient.new(name: "a" * 101).valid?
    assert Ingredient.new(name: "a" * 100).valid?
  end

  test "een gebruikt ingrediënt kan niet worden verwijderd" do
    assert_not ingredients(:bloem).destroy
    assert Ingredient.exists?(ingredients(:bloem).id)
  end

  test "een ongebruikt ingrediënt kan wel worden verwijderd" do
    assert ingredients(:ongebruikt).destroy
  end

  test "conversions and label values accept a decimal comma and must be sensible" do
    ingredient = ingredients(:zout)
    ingredient.update!(grams_per_ml: "1,2", label_kcal: "0", label_fat: "")

    assert_equal BigDecimal("1.2"), ingredient.grams_per_ml
    assert_nil ingredient.label_fat

    ingredient.assign_attributes(grams_per_piece: 0, label_protein: 101, label_kcal: 1001, grams_per_ml: "abc")
    refute ingredient.valid?
    assert_equal %i[ grams_per_ml grams_per_piece label_kcal label_protein ], ingredient.errors.attribute_names.sort
  end

  test "a NEVO product that does not exist is a validation error" do
    ingredient = ingredients(:zout)
    ingredient.nevo_food_id = 0

    refute ingredient.valid?
    assert ingredient.errors.added?(:nevo_food, :blank)
  end

  test "amount_in turns an amount into grams or ml" do
    ei = ingredients(:ei)
    assert_equal 100, ei.amount_in("g", 2, "stuks")
    assert_nil ei.amount_in("g", 1, "el")
    assert_equal 15, ei.amount_in("ml", 1, "el")
    assert_equal 30, ei.amount_in("g", 30, "g")

    ei.grams_per_ml = 2
    assert_equal 10, ei.amount_in("g", 1, "tl")
    assert_equal 50, ei.amount_in("ml", 2, "stuks")
  end
end
