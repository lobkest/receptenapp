require "test_helper"

# "In huis": the stock and the recipes you can make with it. Pannenkoeken (fixtures):
# bloem, melk, ei, and zout (optional).
class Api::PantryControllerTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear # reset rate_limit counters
    @recipe = recipes(:pannenkoeken)
    @zout = ingredients(:zout).tap { |zout| zout.update!(staple: true) }
    @bloem = ingredients(:bloem)
    @melk = ingredients(:melk)
    @ei = ingredients(:ei)
  end

  # show

  test "show: what is in the house, every staple (out or not) and quick picks" do
    PantryItem.set!(@ei, true)
    peper = Ingredient.create!(name: "peper", staple: true)
    PantryItem.set!(peper, false)

    get api_pantry_url, as: :json

    assert_response :ok
    assert_equal [ { "id" => @ei.id, "name" => "ei" } ], response.parsed_body["in_house"]
    assert_equal [ { "id" => peper.id, "name" => "peper", "present" => false }, { "id" => @zout.id, "name" => "zout", "present" => true } ],
      response.parsed_body["staples"]
    # Rows of visible recipes, without staples and what is in the house.
    assert_equal %w[ bloem melk ], response.parsed_body["suggestions"].pluck("name")
  end

  test "show: the quick picks are the most used ingredients first, at most 12" do
    15.times { |i| create_recipe("Recept #{i}", [ "melk", "extra #{i.to_s.rjust(2, "0")}" ]) }

    get api_pantry_url, as: :json

    names = response.parsed_body["suggestions"].pluck("name")
    assert_equal 12, names.size
    assert_equal "melk", names.first, "in 16 recipes"
  end

  # update_ingredient and reset

  test "update_ingredient: in the house and out again; a staple that is out" do
    patch ingredient_api_pantry_url(ingredient_id: @ei.id), params: { pantry_item: { present: true } }, as: :json
    assert_response :ok
    assert_equal [ "ei" ], response.parsed_body["in_house"].pluck("name")

    patch ingredient_api_pantry_url(ingredient_id: @ei.id), params: { pantry_item: { present: false } }, as: :json
    assert_equal [], response.parsed_body["in_house"]
    refute PantryItem.exists?(ingredient: @ei)

    patch ingredient_api_pantry_url(ingredient_id: @zout.id), params: { pantry_item: { present: false } }, as: :json
    assert_equal [ false ], response.parsed_body["staples"].pluck("present")
  end

  test "update_ingredient: unknown ingredient 404, without present 400" do
    patch ingredient_api_pantry_url(ingredient_id: 0), params: { pantry_item: { present: true } }, as: :json
    assert_response :not_found

    patch ingredient_api_pantry_url(ingredient_id: @ei.id), params: { pantry_item: { other: 1 } }, as: :json
    assert_response :bad_request
  end

  test "update_ingredient_by_name: an existing ingredient, matched like its name is saved" do
    patch ingredients_api_pantry_url, params: { pantry_item: { name: "  EI ", present: true } }, as: :json
    assert_response :ok
    assert PantryItem.find_by(ingredient: @ei).present

    patch ingredients_api_pantry_url, params: { pantry_item: { name: "ei", present: false } }, as: :json
    refute PantryItem.exists?(ingredient: @ei)
  end

  test "update_ingredient_by_name: in the house makes the ingredient, out makes nothing" do
    assert_difference -> { Ingredient.count }, 1 do
      patch ingredients_api_pantry_url, params: { pantry_item: { name: "wc-papier", present: true } }, as: :json
    end
    assert_response :ok
    assert_includes response.parsed_body["in_house"].pluck("name"), "wc-papier"

    assert_no_difference -> { Ingredient.count } do
      patch ingredients_api_pantry_url, params: { pantry_item: { name: "afwasmiddel", present: false } }, as: :json
    end
    assert_response :ok
  end

  test "update_ingredient_by_name: without a name 422, without present 400" do
    patch ingredients_api_pantry_url, params: { pantry_item: { name: " ", present: true } }, as: :json
    assert_response :unprocessable_content

    patch ingredients_api_pantry_url, params: { pantry_item: { name: "ei" } }, as: :json
    assert_response :bad_request
  end

  test "reset: back to the default, only the staples in the house" do
    PantryItem.set!(@ei, true)
    PantryItem.set!(@zout, false)

    post reset_api_pantry_url, as: :json

    assert_response :ok
    assert_equal 0, PantryItem.count
    assert_equal [], response.parsed_body["in_house"]
    assert_equal [ true ], response.parsed_body["staples"].pluck("present")
  end

  test "writes count towards the shared public limit; reading does not" do
    PublicWriteRateLimit::WRITES_PER_MINUTE.times { delete clear_checked_api_shopping_list_items_url, as: :json }

    post reset_api_pantry_url, as: :json
    assert_response :too_many_requests
    patch ingredient_api_pantry_url(ingredient_id: @ei.id), params: { pantry_item: { present: true } }, as: :json
    assert_response :too_many_requests

    get api_pantry_url, as: :json
    assert_response :ok
    get recipes_api_pantry_url, as: :json
    assert_response :ok
  end

  # recipes

  test "recipes: three groups with the missing rows by row id and name of the original" do
    PantryItem.set!(@bloem, true)
    PantryItem.set!(@ei, true)

    get recipes_api_pantry_url, as: :json

    assert_response :ok
    assert_equal [ 0, 1, 2 ], response.parsed_body.pluck("missing_count")
    one = response.parsed_body[1]["recipes"]
    assert_equal [ {
      "id" => @recipe.id, "title" => "Pannenkoeken", "servings" => 4, "category" => nil,
      "missing" => [ { "id" => recipe_ingredients(:pannenkoeken_melk).id, "name" => "melk" } ]
    } ], one
  end

  test "recipes: tags filter like /api/recipes, also an automatic tag" do
    in_house(@bloem, @melk, @ei)
    create_recipe("Spekpannenkoek", %w[ bloem spek ])

    get recipes_api_pantry_url(tags: "vegetarisch"), as: :json
    assert_equal [ [ "Pannenkoeken" ], [], [] ], titles

    get recipes_api_pantry_url, as: :json
    assert_equal [ [ "Pannenkoeken" ], [ "Spekpannenkoek" ], [] ], titles

    get recipes_api_pantry_url(tags: "vegetarisch,zoet"), as: :json
    assert_equal [ [ "Pannenkoeken" ], [], [] ], titles, "a hand-set tag and an automatic one together"

    get recipes_api_pantry_url(tags: "soep"), as: :json
    assert_equal [ [], [], [] ], titles
  end

  test "recipes: an automatic tag that only passes with a swap (met_wissel) still counts" do
    in_house(@bloem, @melk, @ei)
    tofu = Ingredient.create!(name: "tofu")
    recipe = create_recipe("Wok", %w[ spek ])
    recipe.recipe_ingredients.first.alternatives.create!(ingredient: tofu, position: 1)

    get recipes_api_pantry_url(tags: "vegetarisch"), as: :json

    assert_equal [ [ "Pannenkoeken" ], [ "Wok" ], [] ], titles
  end

  test "recipes: by category, and overig for the recipes without one" do
    in_house(@bloem, @melk, @ei)
    create_recipe("Ontbijtje", %w[ ei ], category_name: "Ontbijt")

    get recipes_api_pantry_url(category: categories(:ontbijt).id), as: :json
    assert_equal [ [ "Ontbijtje" ], [], [] ], titles
    assert_equal "Ontbijt", response.parsed_body[0]["recipes"][0]["category"]["name"]

    get recipes_api_pantry_url(category: "overig"), as: :json
    assert_equal [ [ "Pannenkoeken" ], [], [] ], titles

    get recipes_api_pantry_url(category: "onzin"), as: :json
    assert_equal [ [], [], [] ], titles
  end

  test "recipes: a recipe whose deletion was requested is not there" do
    recipe = create_recipe("Weg", %w[ ei ])
    in_house(@ei)
    recipe.request_deletion!("dubbel")

    get recipes_api_pantry_url, as: :json

    refute_includes titles.flatten, "Weg"
  end

  test "recipes: no query per recipe" do
    in_house(@ei)
    3.times { |i| create_recipe("Extra #{i}", [ "ei", "kaas #{i}" ], tag_names: [ "tag #{i}" ], category_name: "Categorie #{i}", alternative: "tofu") }
    three = count_queries { get recipes_api_pantry_url(tags: "vegetarisch"), as: :json }

    3.times { |i| create_recipe("Nog #{i}", [ "ei", "ham #{i}" ], tag_names: [ "tag #{i}" ], category_name: "Categorie #{i}", alternative: "tofu") }
    six = count_queries { get recipes_api_pantry_url(tags: "vegetarisch"), as: :json }

    assert_equal 6, response.parsed_body[1]["recipes"].size, "pannenkoeken misses bloem and melk"
    assert_equal three, six
  end

  private
    def in_house(*ingredients)
      ingredients.each { |ingredient| PantryItem.set!(ingredient, true) }
    end

    def titles
      response.parsed_body.map { |group| group["recipes"].pluck("title") }
    end

    def create_recipe(title, names, alternative: nil, **attributes)
      rows = names.map { |name| { ingredient_name: name } }
      rows.last[:alternatives_attributes] = [ { ingredient_name: alternative } ] if alternative
      Recipe.create!(title: title, servings: 2, steps_attributes: [ { body: "Koken." } ],
        recipe_ingredients_attributes: rows, **attributes)
    end
end
