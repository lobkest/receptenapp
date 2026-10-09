require "test_helper"

class RecipeTest < ActiveSupport::TestCase
  test "geldig met titel en porties" do
    recipe = Recipe.new(title: "Tomatensoep", servings: 2)
    assert recipe.valid?
  end

  test "ongeldig zonder titel" do
    recipe = Recipe.new(servings: 2)
    assert_not recipe.valid?
    assert recipe.errors.added?(:title, :blank)
  end

  test "porties moeten groter dan 0 zijn" do
    recipe = Recipe.new(title: "Tomatensoep", servings: 0)
    assert_not recipe.valid?
    assert recipe.errors[:servings].any?
  end

  test "fixture is geldig" do
    assert recipes(:pannenkoeken).valid?
  end
end
