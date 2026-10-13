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

  test "nieuw recept is standaard pending" do
    recipe = Recipe.new(title: "Tomatensoep", servings: 2)
    assert recipe.pending?
  end

  test "status accepteert pending, approved en rejected" do
    %w[ pending approved rejected ].each do |status|
      recipe = Recipe.new(title: "Tomatensoep", servings: 2, status: status)
      assert recipe.valid?, "#{status} zou geldig moeten zijn"
    end
  end

  test "onbekende status is ongeldig" do
    recipe = Recipe.new(title: "Tomatensoep", servings: 2, status: "banaan")
    assert_not recipe.valid?
    assert recipe.errors[:status].any?
  end

  test "approved! slaat de nieuwe status op" do
    recipe = recipes(:erwtensoep)
    recipe.approved!
    assert recipe.reload.approved?
  end

  test "scopes filteren op status" do
    assert_includes Recipe.approved, recipes(:pannenkoeken)
    assert_not_includes Recipe.approved, recipes(:erwtensoep)
    assert_not_includes Recipe.approved, recipes(:stamppot)
  end
end
