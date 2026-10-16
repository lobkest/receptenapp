require "test_helper"

class Api::RecipesControllerTest < ActionDispatch::IntegrationTest
  setup do
    @recipe = recipes(:pannenkoeken)
    Rails.cache.clear # reset rate_limit counters
  end

  test "index returns every recipe, except those with a deletion request" do
    get api_recipes_url, as: :json

    assert_response :ok
    assert_kind_of Array, response.parsed_body
    titles = response.parsed_body.map { |r| r["title"] }
    assert_equal %w[ Pannenkoeken Stamppot ], titles.sort
  end

  test "show returns a recipe, with its lock_version for editing" do
    get api_recipe_url(@recipe), as: :json

    assert_response :ok
    assert_equal @recipe.id, response.parsed_body["id"]
    assert_equal "Pannenkoeken", response.parsed_body["title"]
    assert_equal 0, response.parsed_body["lock_version"]
  end

  test "show has the estimated nutrition of the recipe and of each variation" do
    get api_recipe_url(@recipe), as: :json

    nutrition = response.parsed_body["nutrition"]
    assert_equal 4, nutrition["servings"]
    assert_equal 2, nutrition["counted"]
    assert_equal 1005.0, nutrition["total"]["kcal"]
    assert_equal 251.3, nutrition["per_serving"]["kcal"]
    assert_equal [ { "name" => "melk", "reason" => "gram per ml ontbreekt" }, { "name" => "zout", "reason" => "optioneel" } ],
      nutrition["not_counted"]
    assert_equal [ "2025/9.0" ], nutrition["nevo_versions"]

    variation = response.parsed_body["variations"].find { |v| v["name"] == "Met spek" }
    assert_includes variation["nutrition"]["not_counted"], { "name" => "spek", "reason" => "niet gekoppeld" }
  end

  test "index stays compact: no ingredients or steps" do
    get api_recipes_url, as: :json

    recipe = response.parsed_body.find { |r| r["title"] == "Pannenkoeken" }
    assert_equal %w[ category created_at description id servings tags title updated_at ], recipe.keys.sort
    assert_equal %w[ vega zoet ], recipe["tags"]
    assert_nil recipe["category"], "a recipe from before categories has none"
  end

  test "index loads tags and categories without one query per recipe" do
    3.times { |i| create_recipe("Extra #{i}", tag_names: [ "vega", "tag #{i}" ], category_name: "Categorie #{i}") }

    queries = count_queries { get api_recipes_url, as: :json }

    # recipes, recipe_tags, tags and categories: the same for 1 or 100 recipes.
    assert_operator queries, :<=, 4
  end

  test "index and show include the category with id, name and position" do
    @recipe.update!(category: categories(:ontbijt))
    expected = { "id" => categories(:ontbijt).id, "name" => "Ontbijt", "position" => 1 }

    get api_recipes_url, as: :json
    assert_equal expected, response.parsed_body.find { |r| r["id"] == @recipe.id }["category"]

    get api_recipe_url(@recipe), as: :json
    assert_equal expected, response.parsed_body["category"]
  end

  test "index with tags returns only visible recipes with ALL of them" do
    both = create_recipe("Groentetaart", tag_names: %w[ vega hartig ])
    create_recipe("Kaasplank", tag_names: %w[ hartig ])
    create_recipe("Weg ermee", tag_names: %w[ vega hartig ]).request_deletion!

    get api_recipes_url(tags: "Vega,hartig"), as: :json

    assert_response :ok
    assert_equal [ both.id ], response.parsed_body.pluck("id")
    assert_equal %w[ hartig vega ], response.parsed_body.first["tags"]
  end

  test "index with one tag, an unknown tag, or an empty filter" do
    get api_recipes_url(tags: "vega"), as: :json
    assert_equal [ "Pannenkoeken" ], response.parsed_body.pluck("title"), "erwtensoep has vega but is hidden"

    get api_recipes_url(tags: "vega,bestaat-niet"), as: :json
    assert_equal [], response.parsed_body

    get api_recipes_url(tags: ",,"), as: :json
    assert_equal Recipe.visible.count, response.parsed_body.size
  end

  test "show includes ingredients and steps in order" do
    get api_recipe_url(@recipe), as: :json

    assert_response :ok
    body = response.parsed_body
    assert_equal [ 1, 2, 3 ], body["steps"].map { |step| step["position"] }
    assert_equal steps(:pannenkoeken_beslag).id, body["steps"].first["id"]
    assert_match "glad beslag", body["steps"].first["body"]
    assert_includes body["ingredients"], { "id" => recipe_ingredients(:pannenkoeken_bloem).id, "name" => "bloem", "quantity" => 250, "unit" => "g", "optional" => false, "alternatives" => [] }
    assert_includes body["ingredients"], { "id" => recipe_ingredients(:pannenkoeken_ei).id, "name" => "ei", "quantity" => 2, "unit" => "stuks", "optional" => false, "alternatives" => [] }
    assert_includes body["ingredients"], { "id" => recipe_ingredients(:pannenkoeken_zout).id, "name" => "zout", "quantity" => nil, "unit" => nil, "optional" => true, "alternatives" => [] }
  end

  test "show loads ingredients without one query per row" do
    queries = count_queries { get api_recipe_url(@recipe), as: :json }

    # recipe, recipe_tags, tags, steps, recipe_ingredients, ingredients and their NEVO
    # products, plus for the variations: recipe_variations, their removals (with
    # recipe_ingredients and ingredients), additions, tag changes and tags, and the
    # ingredients of the additions (nutrition). The same for 4 or 40 rows; see also
    # RecipeVariationsTest for many variations.
    assert_operator queries, :<=, 15
  end

  test "show with unknown id returns 404" do
    get api_recipe_url(id: 0), as: :json

    assert_response :not_found
    assert_equal "Recept niet gevonden.", response.parsed_body["error"]
  end

  test "show of a recipe with a deletion request returns 404" do
    get api_recipe_url(recipes(:erwtensoep)), as: :json

    assert_response :not_found
    assert_equal "Recept niet gevonden.", response.parsed_body["error"]
  end

  test "an older recipe without ingredients and steps is visible like any other" do
    get api_recipe_url(recipes(:stamppot)), as: :json

    assert_response :ok
    assert_equal [], response.parsed_body["steps"]
  end

  test "create makes a recipe that is visible right away" do
    assert_difference("Recipe.count", 1) do
      post api_recipes_url, params: { recipe: recipe_params(title: "Hutspot", description: "Wortel en ui", servings: 6) }, as: :json
    end

    assert_response :created
    assert_equal "Hutspot", response.parsed_body["title"]
    assert_not response.parsed_body.key?("status")

    get api_recipes_url, as: :json
    assert_includes response.parsed_body.pluck("title"), "Hutspot"
    get api_recipe_url(Recipe.last), as: :json
    assert_response :ok
  end

  test "create ignores a deletion request sent along" do
    post api_recipes_url, params: { recipe: recipe_params(title: "Sneaky", deletion_requested_at: Time.current) }, as: :json

    assert_response :created
    assert_not Recipe.find(response.parsed_body["id"]).deletion_requested?
  end

  test "create with ingredients and steps keeps the submitted order" do
    post api_recipes_url, params: { recipe: recipe_params(
      recipe_ingredients_attributes: [
        { ingredient_name: "  Wortel ", quantity: "1000", unit: "g" },
        { ingredient_name: "ui", quantity: "1,5", unit: "stuks" },
        { ingredient_name: "peper", quantity: "", unit: "g", optional: true }
      ],
      steps_attributes: [ { body: "Schillen." }, { body: "Koken." }, { body: "Stampen." } ]
    ) }, as: :json

    assert_response :created
    body = response.parsed_body
    assert_equal [ [ 1, "Schillen." ], [ 2, "Koken." ], [ 3, "Stampen." ] ],
      body["steps"].map { |step| [ step["position"], step["body"] ] }
    assert_equal [
      { "name" => "wortel", "quantity" => 1000, "unit" => "g", "optional" => false, "alternatives" => [] },
      { "name" => "ui", "quantity" => 1.5, "unit" => "stuks", "optional" => false, "alternatives" => [] },
      { "name" => "peper", "quantity" => nil, "unit" => nil, "optional" => true, "alternatives" => [] }
    ], body["ingredients"].map { |row| row.except("id") }
    assert_equal [ 1, 2, 3 ], Recipe.find(body["id"]).steps.pluck(:position)
  end

  test "create ignores positions, ids and _destroy from the client" do
    other_step = steps(:pannenkoeken_beslag)

    post api_recipes_url, params: { recipe: recipe_params(
      steps_attributes: [ { body: "Eerst", position: 9 }, { id: other_step.id, body: "Gekaapt", _destroy: "1" } ]
    ) }, as: :json

    assert_response :created
    assert_equal [ [ 1, "Eerst" ], [ 2, "Gekaapt" ] ], response.parsed_body["steps"].map { |s| [ s["position"], s["body"] ] }
    assert_equal "Meng bloem, zout en de helft van de melk tot een glad beslag.", other_step.reload.body
  end

  test "create reports errors per row with the index from the request" do
    assert_no_difference([ "Recipe.count", "Ingredient.count", "Step.count" ]) do
      post api_recipes_url, params: { recipe: recipe_params(
        recipe_ingredients_attributes: [
          { ingredient_name: "drakenfruit", quantity: 1, unit: "stuks" },
          { ingredient_name: "suiker", quantity: -5, unit: "cup" }
        ],
        steps_attributes: [ { body: "Goed." }, { body: "" } ]
      ) }, as: :json
    end

    assert_response :unprocessable_content
    errors = response.parsed_body["errors"]
    assert_equal [ "moet groter zijn dan 0" ], errors["recipe_ingredients[1].quantity"]
    assert_equal [ "is niet in de lijst opgenomen" ], errors["recipe_ingredients[1].unit"]
    assert_equal [ "moet opgegeven zijn" ], errors["steps[1].body"]
    assert_not errors.key?("recipe_ingredients[0].ingredient_name")
  end

  test "create without ingredients and steps returns 422" do
    post api_recipes_url, params: { recipe: recipe_params(recipe_ingredients_attributes: [], steps_attributes: []) }, as: :json

    assert_response :unprocessable_content
    assert_equal [ "moet opgegeven zijn" ], response.parsed_body["errors"]["steps"]
    assert_equal [ "moet opgegeven zijn" ], response.parsed_body["errors"]["recipe_ingredients"]
  end

  test "create with too many steps returns 422" do
    post api_recipes_url, params: { recipe: recipe_params(steps_attributes: (1..31).map { |i| { body: "Stap #{i}" } }) }, as: :json

    assert_response :unprocessable_content
    assert_equal [ "heeft te veel regels (maximaal 30)" ], response.parsed_body["errors"]["steps"]
  end

  test "create with far too many rows returns 422 without building them" do
    assert_no_difference("Recipe.count") do
      post api_recipes_url, params: { recipe: recipe_params(steps_attributes: (1..101).map { |i| { body: "Stap #{i}" } }) }, as: :json
    end

    assert_response :unprocessable_content
    assert_equal [ "heeft te veel regels" ], response.parsed_body["errors"]["base"]
  end

  test "create without title returns 422 with errors" do
    assert_no_difference("Recipe.count") do
      post api_recipes_url, params: { recipe: recipe_params(title: "") }, as: :json
    end

    assert_response :unprocessable_content
    assert_includes response.parsed_body["errors"]["title"], "moet opgegeven zijn"
  end

  test "create with tag_names reuses existing tags and creates new ones" do
    assert_difference("Tag.count", 1) do
      post api_recipes_url, params: { recipe: recipe_params(tag_names: [ "VEGA", "Winter", "winter " ]) }, as: :json
    end

    assert_response :created
    assert_equal %w[ vega winter ], response.parsed_body["tags"]
    recipe = Recipe.find(response.parsed_body["id"])
    assert_includes recipe.tags, tags(:vega)
  end

  test "create refuses more than 10 tags or a tag over 30 characters, and creates no tags" do
    too_many = (1..11).map { |i| "tag #{i}" }

    assert_no_difference([ "Recipe.count", "Tag.count" ]) do
      post api_recipes_url, params: { recipe: recipe_params(tag_names: too_many) }, as: :json
    end
    assert_response :unprocessable_content
    assert_equal [ "heeft te veel tags (maximaal 10)" ], response.parsed_body["errors"]["tag_names"]

    post api_recipes_url, params: { recipe: recipe_params(tag_names: [ "a" * 31 ]) }, as: :json
    assert_response :unprocessable_content
    assert_match "maximaal 30 tekens", response.parsed_body["errors"]["tag_names"].first
  end

  test "create with an existing category, in any case, reuses it" do
    assert_no_difference("Category.count") do
      post api_recipes_url, params: { recipe: recipe_params(category_name: "  dINER ") }, as: :json
    end

    assert_response :created
    assert_equal categories(:diner).id, response.parsed_body["category"]["id"]
    assert_equal categories(:diner), Recipe.find(response.parsed_body["id"]).category
  end

  test "create with a new category makes it, at the end of the order" do
    assert_difference("Category.count", 1) do
      post api_recipes_url, params: { recipe: recipe_params(category_name: " Bijgerecht ") }, as: :json
    end

    assert_response :created
    assert_equal({ "name" => "Bijgerecht", "position" => 5 }, response.parsed_body["category"].except("id"))
    get api_categories_url, as: :json
    assert_equal %w[ Ontbijt Lunch Diner Snacks Bijgerecht ], response.parsed_body.pluck("name")
  end

  test "create without a category, or with an empty one, has none" do
    post api_recipes_url, params: { recipe: recipe_params }, as: :json
    assert_nil response.parsed_body["category"]

    assert_no_difference("Category.count") do
      post api_recipes_url, params: { recipe: recipe_params(category_name: "  ") }, as: :json
    end
    assert_response :created
    assert_nil response.parsed_body["category"]
  end

  test "create refuses an invalid new category, in Dutch, and makes nothing" do
    assert_no_difference([ "Recipe.count", "Category.count" ]) do
      post api_recipes_url, params: { recipe: recipe_params(category_name: "a" * 31) }, as: :json
    end
    assert_response :unprocessable_content
    assert_equal [ "is te lang (maximaal 30 tekens)" ], response.parsed_body["errors"]["category_name"]

    post api_recipes_url, params: { recipe: recipe_params(category_name: "overig") }, as: :json
    assert_equal [ "kan niet \"Overig\" zijn, die naam is gereserveerd" ], response.parsed_body["errors"]["category_name"]
  end

  test "create is rate limited per IP" do
    assert_equal 5, Api::RecipesController::SUBMISSIONS_PER_HOUR, "default without RECIPE_SUBMISSIONS_PER_HOUR"

    5.times do
      post api_recipes_url, params: { recipe: recipe_params(title: "Spam") }, as: :json
      assert_response :created
    end

    assert_no_difference("Recipe.count") do
      post api_recipes_url, params: { recipe: recipe_params(title: "Spam") }, as: :json
    end
    assert_response :too_many_requests

    post api_recipes_url, params: { recipe: recipe_params(title: "Ander IP") }, as: :json,
      env: { "REMOTE_ADDR" => "203.0.113.7" }
    assert_response :created
  end

  # Unknown API routes end up in Api::NotFoundController, so check behaviour instead of routing.
  # Deleting is only a request (see deletion_requests_test.rb); editing is in recipes_update_test.rb.
  test "destroy is not publicly routed" do
    assert_no_difference("Recipe.count") do
      delete api_recipe_url(@recipe), as: :json
    end
    assert_response :not_found
    assert_equal "Pannenkoeken", @recipe.reload.title
  end

  private
    def recipe_params(**overrides)
      {
        title: "Hutspot",
        servings: 4,
        recipe_ingredients_attributes: [ { ingredient_name: "aardappel", quantity: 1000, unit: "g" } ],
        steps_attributes: [ { body: "Alles koken en stampen." } ]
      }.merge(overrides)
    end

    def create_recipe(title, **attributes)
      Recipe.create!(recipe_params(title: title, **attributes))
    end

    def count_queries(&block)
      count = 0
      counter = ->(*, payload) { count += 1 unless payload[:name].in?([ "SCHEMA", "TRANSACTION" ]) }
      ActiveSupport::Notifications.subscribed(counter, "sql.active_record", &block)
      count
    end
end
