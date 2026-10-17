require "test_helper"

# Pannenkoeken (fixtures): bloem, melk, ei, and zout (optional).
class PantryMatcherTest < ActiveSupport::TestCase
  setup do
    @recipe = recipes(:pannenkoeken)
    @bloem = ingredients(:bloem)
    @melk = ingredients(:melk)
    @ei = ingredients(:ei)
  end

  test "a staple counts as in the house without a row" do
    @bloem.update!(staple: true)
    in_house(@melk, @ei)

    assert_equal [], missing_names
  end

  test "a staple that is out counts as missing" do
    @bloem.update!(staple: true)
    PantryItem.set!(@bloem, false)
    in_house(@melk, @ei)

    assert_equal [ "bloem" ], missing_names
    assert_equal [ recipe_ingredients(:pannenkoeken_bloem).id ], result.missing.map(&:id)
  end

  test "an alternative in the house makes the row complete; the name is still the original's" do
    havermelk = Ingredient.create!(name: "havermelk")
    recipe_ingredients(:pannenkoeken_melk).alternatives.create!(ingredient: havermelk, position: 1)
    in_house(@bloem, havermelk)

    assert_equal [ "ei" ], missing_names
  end

  test "an optional row never counts, and neither do amounts" do
    in_house(@bloem, @melk, @ei)

    refute PantryItem.present_ingredient_ids.include?(ingredients(:zout).id)
    assert_equal [], missing_names
  end

  test "3 missing is left out; 1 and 2 are in, fewest first" do
    create_recipe("Soep", %w[ ui bouillon ])
    create_recipe("Salade", %w[ sla ])

    results = matcher.results(Recipe.with_all_tags([], evaluator: RecipeTagEvaluator.load))

    assert_nil result, "bloem, melk and ei are all missing"
    assert_equal [ [ "Salade", 1 ], [ "Soep", 2 ] ], results.map { |r| [ r.recipe.title, r.missing.size ] }
    assert_equal [ "ui", "bouillon" ], results.last.missing.map(&:name)
  end

  test "a recipe without ingredients says nothing and is left out" do
    in_house(@bloem, @melk, @ei)

    titles = matcher.results(Recipe.with_all_tags([], evaluator: RecipeTagEvaluator.load)).map { |r| r.recipe.title }

    assert_equal [ "Pannenkoeken" ], titles, "stamppot has no ingredients"
  end

  private
    def in_house(*ingredients)
      ingredients.each { |ingredient| PantryItem.set!(ingredient, true) }
    end

    def matcher
      PantryMatcher.new(PantryItem.present_ingredient_ids)
    end

    def result
      matcher.results(Recipe.with_details.where(id: @recipe.id)).first
    end

    def missing_names
      result.missing.map(&:name)
    end

    def create_recipe(title, names)
      Recipe.create!(title: title, servings: 2, steps_attributes: [ { body: "Koken." } ],
        recipe_ingredients_attributes: names.map { |name| { ingredient_name: name } })
    end
end
