require "test_helper"

# Pannenkoeken (fixtures): bloem, melk, ei, and zout (optional).
class IngredientSearchTest < ActiveSupport::TestCase
  setup do
    @pannenkoeken = recipes(:pannenkoeken)
    @melk = ingredients(:melk)
    @ei = ingredients(:ei)
    @zout = ingredients(:zout)
    @havermelk = Ingredient.create!(name: "havermelk")
    @melk_row = recipe_ingredients(:pannenkoeken_melk)
    @alternative = @melk_row.alternatives.create!(ingredient: @havermelk, position: 1)
  end

  test "a chosen ingredient matches as the original, as an alternative or in an optional row" do
    assert_equal [ [ @ei.id, "original", nil ] ], matches(search(@ei))
    assert_equal [ [ @havermelk.id, "alternative", @alternative ] ], matches(search(@havermelk))
    assert_equal [ [ @zout.id, "optional", nil ] ], matches(search(@zout))
  end

  test "the swap belongs to the row the alternative replaces" do
    match = search(@havermelk).matches.first

    assert_equal @melk_row, match.row
    assert_equal [ "melk", "havermelk" ], [ match.row.ingredient_name, match.alternative.ingredient_name ]
  end

  test "an alternative in an optional row matches as optional, with the swap" do
    @melk_row.update_column(:optional, true)

    match = search(@havermelk).matches.first
    assert_equal [ "optional", @alternative ], [ match.via, match.alternative ]
  end

  test "a recipe without any chosen ingredient is left out" do
    assert_empty IngredientSearch.new([ Ingredient.create!(name: "kaas").id ], present_ids: Set.new).results(recipes_list)
  end

  test "missing: the PantryMatcher rows, with the chosen ingredients in the house and no limit" do
    PantryItem.set!(ingredients(:bloem), true)

    assert_equal [ "melk" ], search(@ei).missing.map(&:name), "zout is optional"
    assert_equal [ "ei" ], search(@havermelk).missing.map(&:name), "havermelk covers the melk row"
    assert_equal [ @melk_row.id ], search(@ei).missing.map(&:id)

    create_recipe("Groot", %w[ ei a b c d ])
    groot = IngredientSearch.new([ @ei.id ], present_ids: Set.new).results(recipes_list).find { |r| r.recipe.title == "Groot" }
    assert_equal %w[ a b c d ], groot.missing.map(&:name)
  end

  test "sorted by how many chosen ingredients, then original > alternative > optional, then to buy, then title" do
    create_recipe("Omelet", %w[ ei ])                                    # 1 original, 0 to buy
    create_recipe("Eiersalade", %w[ ei mayonaise ])                      # 1 original, 1 to buy
    create_recipe("Havermout", %w[ havermout melk ], alternative: "havermelk") # 1 alternative
    create_recipe("Boterham", %w[ brood ], optional: "havermelk")        # 1 optional
    create_recipe("Aardappels", %w[ aardappel ])                         # no match

    titles = IngredientSearch.new([ @ei.id, @havermelk.id ], present_ids: Set.new).results(recipes_list).map { |r| r.recipe.title }

    # Pannenkoeken has both (ei and havermelk), so it comes first.
    assert_equal [ "Pannenkoeken", "Omelet", "Eiersalade", "Havermout", "Boterham" ], titles
  end

  test "the same matches: fewer to buy first, then by title" do
    create_recipe("B", %w[ ei x ])
    create_recipe("A", %w[ ei y ])
    create_recipe("C", %w[ ei ])

    titles = IngredientSearch.new([ @ei.id ], present_ids: Set.new).results(recipes_list).map { |r| r.recipe.title }

    assert_equal [ "C", "A", "B", "Pannenkoeken" ], titles
  end

  test "the best row counts when an ingredient is in two rows" do
    create_recipe("Kwark", %w[ kwark melk ], optional: "havermelk")
    Recipe.find_by!(title: "Kwark").recipe_ingredients.first.alternatives.create!(ingredient: @havermelk, position: 1)

    result = IngredientSearch.new([ @havermelk.id ], present_ids: Set.new).results(recipes_list).find { |r| r.recipe.title == "Kwark" }

    assert_equal [ "alternative" ], result.matches.map(&:via)
  end

  private
    def search(ingredient)
      IngredientSearch.new([ ingredient.id ], present_ids: PantryItem.present_ingredient_ids).results(recipes_list)
        .find { |result| result.recipe == @pannenkoeken }
    end

    def matches(result)
      result.matches.map { |match| [ match.ingredient_id, match.via, match.alternative ] }
    end

    def recipes_list
      Recipe.with_all_tags([], evaluator: RecipeTagEvaluator.load)
    end

    # alternative: for the last row; optional: an extra optional row.
    def create_recipe(title, names, alternative: nil, optional: nil)
      rows = names.map { |name| { ingredient_name: name } }
      rows.last[:alternatives_attributes] = [ { ingredient_name: alternative } ] if alternative
      rows << { ingredient_name: optional, optional: true } if optional
      Recipe.create!(title: title, servings: 2, steps_attributes: [ { body: "Koken." } ], recipe_ingredients_attributes: rows)
    end
end
