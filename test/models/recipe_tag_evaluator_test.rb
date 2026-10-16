require "test_helper"

# The automatic tags of a recipe and a variation, worked out from the traits of the
# ingredients (fixtures: traits.yml, tag_exclusions.yml).
class RecipeTagEvaluatorTest < ActiveSupport::TestCase
  setup do
    @kip = ingredient("kip", :vlees, :dierlijk)
    @tofu = ingredient("tofu")
    @tempeh = ingredient("tempeh")
    @zalm = ingredient("zalm", :vis, :dierlijk)
    @feta = ingredient("feta", :dierlijk, :lactose)
    @rijst = ingredient("rijst")
  end

  test "vlees makes a recipe not vegetarisch, and says which ingredient" do
    recipe = recipe_with({ ingredient_name: "kip" }, { ingredient_name: "rijst" })

    vegetarisch = result(recipe, "vegetarisch")
    assert_equal "nee", vegetarisch.status
    assert_equal [ "kip" ], vegetarisch.blockers
    refute vegetarisch.passes?
    assert_equal "ja", result(recipe, "glutenvrij").status
  end

  test "an optional kip is left out, with the hint zonder kip" do
    recipe = recipe_with({ ingredient_name: "kip", optional: true }, { ingredient_name: "rijst" })
    row = recipe.recipe_ingredients.first

    vegetarisch = result(recipe, "vegetarisch")
    assert_equal "ja", vegetarisch.status
    assert_empty vegetarisch.swaps
    assert_equal [ RecipeTagEvaluator::Skip.new(recipe_ingredient_id: row.id, ingredient: "kip", alternative_ids: []) ], vegetarisch.without
  end

  test "kip with the alternative tofu: met_wissel, with the swap that is needed" do
    recipe = recipe_with({ ingredient_name: "kip", alternatives_attributes: [ { ingredient_name: "tofu" } ] }, { ingredient_name: "rijst" })
    row = recipe.recipe_ingredients.first

    vegetarisch = result(recipe, "vegetarisch")
    assert_equal "met_wissel", vegetarisch.status
    assert vegetarisch.passes?
    swap = vegetarisch.swaps.sole
    assert_equal [ row.id, "kip" ], [ swap.recipe_ingredient_id, swap.ingredient ]
    assert_equal [ [ row.alternatives.first.id, "tofu" ] ], swap.alternatives.map { |option| [ option.id, option.name ] }
    # Without the swap nothing else is needed: the other tags are plain "ja", except
    # veganistisch, which needs the same swap (kip is dierlijk).
    assert_equal({ "glutenvrij" => "ja", "lactosevrij" => "ja", "veganistisch" => "met_wissel", "vegetarisch" => "met_wissel" },
      statuses(recipe))
  end

  test "met_wissel with several alternatives gives all that fit, not the ones that do not" do
    recipe = recipe_with({ ingredient_name: "kip", alternatives_attributes: [
      { ingredient_name: "zalm" }, { ingredient_name: "tofu" }, { ingredient_name: "tempeh" } ] })

    assert_equal %w[ tofu tempeh ], result(recipe, "vegetarisch").swaps.sole.alternatives.map(&:name)
  end

  test "an optional row that can be swapped: left out, with the alternatives that fit" do
    recipe = recipe_with({ ingredient_name: "kip", optional: true, alternatives_attributes: [ { ingredient_name: "tofu" } ] },
      { ingredient_name: "rijst" })
    row = recipe.recipe_ingredients.first

    vegetarisch = result(recipe, "vegetarisch")
    assert_equal "ja", vegetarisch.status
    assert_equal [ row.alternatives.first.id ], vegetarisch.without.sole.alternative_ids
  end

  test "vis follows the rules: not vegetarisch, but fine for a tag that only excludes vlees" do
    pescotarisch = Tag.create!(name: "pescotarisch")
    pescotarisch.tag_exclusions.create!(trait: traits(:vlees))
    recipe = recipe_with({ ingredient_name: "zalm" }, { ingredient_name: "rijst" })

    assert_equal "nee", result(recipe, "vegetarisch").status
    assert_equal "ja", result(recipe, "pescotarisch").status
    recipe_with_kip = recipe_with({ ingredient_name: "kip" })
    assert_equal "nee", result(recipe_with_kip, "pescotarisch").status
  end

  test "veganistisch fails on feta, vegetarisch does not" do
    recipe = recipe_with({ ingredient_name: "feta" }, { ingredient_name: "rijst" })

    assert_equal({ "glutenvrij" => "ja", "lactosevrij" => "nee", "veganistisch" => "nee", "vegetarisch" => "ja" }, statuses(recipe))
  end

  test "a variation with + kip loses vegetarisch; one without the kip gains it" do
    vega = recipe_with({ ingredient_name: "tofu" }, { ingredient_name: "rijst" })
    met_kip = vega.variations.create!(name: "Met kip", added_ingredients: [ { name: "kip", quantity: 100, unit: "g" } ])

    evaluator = RecipeTagEvaluator.load
    assert_equal "nee", evaluator.for_variation(met_kip).find { |r| r.name == "vegetarisch" }.status
    assert_equal [ [ "remove", "veganistisch" ], [ "remove", "vegetarisch" ] ], evaluator.variation_changes(met_kip)

    vlees = recipe_with({ ingredient_name: "kip" }, { ingredient_name: "rijst" })
    zonder = vlees.variations.create!(name: "Zonder kip", removed_ingredient_ids: [ vlees.recipe_ingredients.first.id ],
      added_ingredients: [ { name: "tofu" } ])
    assert_equal [ [ "add", "veganistisch" ], [ "add", "vegetarisch" ] ], RecipeTagEvaluator.load.variation_changes(zonder)
  end

  test "an ingredient without traits counts as ok; a recipe without ingredients gets none" do
    assert_equal({ "glutenvrij" => "ja", "lactosevrij" => "ja", "veganistisch" => "ja", "vegetarisch" => "ja" },
      statuses(recipe_with({ ingredient_name: "iets nieuws" })))
    assert_equal({ "glutenvrij" => "nee", "lactosevrij" => "nee", "veganistisch" => "nee", "vegetarisch" => "nee" },
      statuses(recipes(:stamppot)))
  end

  test "disclaimer for the tags about gluten and lactose" do
    results = RecipeTagEvaluator.load.for_recipe(recipe_with({ ingredient_name: "rijst" })).to_h { |r| [ r.name, r.disclaimer ] }

    assert_equal({ "glutenvrij" => true, "lactosevrij" => true, "veganistisch" => false, "vegetarisch" => false }, results)
  end

  private
    def ingredient(name, *trait_names)
      Ingredient.create!(name: name).tap { |record| record.traits = trait_names.map { |trait| traits(trait) } }
    end

    def recipe_with(*rows)
      Recipe.create!(title: "Test #{SecureRandom.hex(3)}", servings: 2, steps_attributes: [ { body: "Koken." } ],
        recipe_ingredients_attributes: rows)
    end

    def evaluate(recipe)
      RecipeTagEvaluator.load.for_recipe(Recipe.includes(RecipeTagEvaluator::PRELOAD).find(recipe.id))
    end

    def result(recipe, name)
      evaluate(recipe).find { |result| result.name == name }
    end

    def statuses(recipe)
      evaluate(recipe).to_h { |result| [ result.name, result.status ] }
    end
end
