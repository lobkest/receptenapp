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
end
