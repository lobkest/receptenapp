require "test_helper"

# GET /api/recipes?ingredient_ids=12,34 ("Met ingrediënt…"). Pannenkoeken (fixtures):
# bloem, melk, ei, and zout (optional).
class Api::RecipeIngredientSearchTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    @pannenkoeken = recipes(:pannenkoeken)
    @ei = ingredients(:ei)
    @havermelk = Ingredient.create!(name: "havermelk")
    @melk_row = recipe_ingredients(:pannenkoeken_melk)
    @alternative = @melk_row.alternatives.create!(ingredient: @havermelk, position: 1)
  end

  test "each recipe says how it matches, with the swap for an alternative, and what to buy" do
    PantryItem.set!(ingredients(:bloem), true)

    get api_recipes_url(ingredient_ids: "#{@havermelk.id}"), as: :json

    assert_response :ok
    recipe = response.parsed_body.sole
    assert_equal "Pannenkoeken", recipe["title"]
    assert_equal({
      "matches" => [ {
        "ingredient_id" => @havermelk.id, "name" => "havermelk", "via" => "alternative",
        "swap" => { "recipe_ingredient_id" => @melk_row.id, "alternative_id" => @alternative.id, "ingredient" => "melk", "alternative" => "havermelk" }
      } ],
      "missing" => [ { "id" => recipe_ingredients(:pannenkoeken_ei).id, "name" => "ei" } ],
      "missing_count" => 1
    }, recipe["ingredient_match"])
    assert recipe.key?("automatic_tags"), "the rest of the summary is there too"
  end

  test "an original or optional match has no swap" do
    get api_recipes_url(ingredient_ids: "#{@ei.id},#{ingredients(:zout).id}"), as: :json

    matches = response.parsed_body.sole["ingredient_match"]["matches"]
    assert_equal [ [ "ei", "original", nil ], [ "zout", "optional", nil ] ], matches.map { |m| m.values_at("name", "via", "swap") }
  end

  test "sorted best first; without ingredient_ids nothing changes" do
    create_recipe("Omelet", %w[ ei ])
    create_recipe("Eiersalade", %w[ ei mayonaise ])
    create_recipe("Havermout", %w[ havermout melk ], alternative: "havermelk")

    get api_recipes_url(ingredient_ids: "#{@ei.id},#{@havermelk.id}"), as: :json
    assert_equal [ "Pannenkoeken", "Omelet", "Eiersalade", "Havermout" ], response.parsed_body.pluck("title")

    get api_recipes_url, as: :json
    refute response.parsed_body.first.key?("ingredient_match")
  end

  test "combines with tags and category" do
    omelet = create_recipe("Omelet", %w[ ei ], tag_names: [ "snel" ], category_name: "Ontbijt")
    create_recipe("Eiersalade", %w[ ei ], tag_names: [ "snel" ])

    get api_recipes_url(ingredient_ids: @ei.id.to_s, tags: "snel", category: omelet.category_id), as: :json
    assert_equal [ "Omelet" ], response.parsed_body.pluck("title")

    get api_recipes_url(ingredient_ids: @ei.id.to_s, category: "overig"), as: :json
    assert_equal [ "Eiersalade", "Pannenkoeken" ], response.parsed_body.pluck("title")
  end

  test "unknown or nonsense ids find nothing; an empty filter is no filter; hidden recipes are left out" do
    get api_recipes_url(ingredient_ids: "0,abc"), as: :json
    assert_equal [], response.parsed_body

    get api_recipes_url(ingredient_ids: ",,"), as: :json
    assert_equal Recipe.visible.count, response.parsed_body.size

    @pannenkoeken.request_deletion!
    get api_recipes_url(ingredient_ids: @ei.id.to_s), as: :json
    assert_equal [], response.parsed_body
  end

  test "no query per recipe" do
    3.times { |i| create_recipe("Extra #{i}", [ "ei", "kaas #{i}" ], tag_names: [ "tag #{i}" ], category_name: "Categorie #{i}", alternative: "havermelk") }
    three = count_queries { get api_recipes_url(ingredient_ids: "#{@ei.id},#{@havermelk.id}"), as: :json }

    3.times { |i| create_recipe("Nog #{i}", [ "ei", "ham #{i}" ], tag_names: [ "tag #{i}" ], category_name: "Categorie #{i}", alternative: "havermelk") }
    six = count_queries { get api_recipes_url(ingredient_ids: "#{@ei.id},#{@havermelk.id}"), as: :json }

    assert_equal 7, response.parsed_body.size
    assert_equal three, six
  end

  private
    def create_recipe(title, names, alternative: nil, **attributes)
      rows = names.map { |name| { ingredient_name: name } }
      rows.last[:alternatives_attributes] = [ { ingredient_name: alternative } ] if alternative
      Recipe.create!(title: title, servings: 2, steps_attributes: [ { body: "Koken." } ],
        recipe_ingredients_attributes: rows, **attributes)
    end
end
