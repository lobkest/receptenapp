require "test_helper"

class Api::RecipesControllerTest < ActionDispatch::IntegrationTest
  setup do
    @recipe = recipes(:pannenkoeken)
    Rails.cache.clear # reset rate_limit counters
  end

  test "index returns only approved recipes" do
    get api_recipes_url, as: :json

    assert_response :ok
    assert_kind_of Array, response.parsed_body
    titles = response.parsed_body.map { |r| r["title"] }
    assert_includes titles, "Pannenkoeken"
    assert_not_includes titles, "Erwtensoep"
    assert_not_includes titles, "Stamppot"
  end

  test "show returns an approved recipe" do
    get api_recipe_url(@recipe), as: :json

    assert_response :ok
    assert_equal @recipe.id, response.parsed_body["id"]
    assert_equal "Pannenkoeken", response.parsed_body["title"]
  end

  test "index stays compact: no ingredients or steps" do
    get api_recipes_url, as: :json

    recipe = response.parsed_body.find { |r| r["title"] == "Pannenkoeken" }
    assert_equal %w[ created_at description id servings status title updated_at ], recipe.keys.sort
  end

  test "show includes ingredients and steps in order" do
    get api_recipe_url(@recipe), as: :json

    assert_response :ok
    body = response.parsed_body
    assert_equal [ 1, 2, 3 ], body["steps"].map { |step| step["position"] }
    assert_equal steps(:pannenkoeken_beslag).id, body["steps"].first["id"]
    assert_match "glad beslag", body["steps"].first["body"]
    assert_includes body["ingredients"], { "id" => recipe_ingredients(:pannenkoeken_bloem).id, "name" => "bloem", "quantity" => 250, "unit" => "g", "note" => nil }
    assert_includes body["ingredients"], { "id" => recipe_ingredients(:pannenkoeken_ei).id, "name" => "ei", "quantity" => 2, "unit" => "stuks", "note" => "op kamertemperatuur" }
    assert_includes body["ingredients"], { "id" => recipe_ingredients(:pannenkoeken_zout).id, "name" => "zout", "quantity" => nil, "unit" => nil, "note" => nil }
  end

  test "show loads ingredients without one query per row" do
    queries = count_queries { get api_recipe_url(@recipe), as: :json }

    # recipe, steps, recipe_ingredients and ingredients: the same for 4 or 40 rows.
    assert_operator queries, :<=, 4
  end

  test "show with unknown id returns 404" do
    get api_recipe_url(id: 0), as: :json

    assert_response :not_found
    assert_equal "Recipe not found", response.parsed_body["error"]
  end

  test "show of a pending recipe returns 404" do
    get api_recipe_url(recipes(:erwtensoep)), as: :json

    assert_response :not_found
    assert_equal "Recipe not found", response.parsed_body["error"]
  end

  test "show of a rejected recipe returns 404" do
    get api_recipe_url(recipes(:stamppot)), as: :json

    assert_response :not_found
  end

  test "create with valid data creates a pending recipe" do
    assert_difference("Recipe.count", 1) do
      post api_recipes_url, params: { recipe: recipe_params(title: "Hutspot", description: "Wortel en ui", servings: 6) }, as: :json
    end

    assert_response :created
    assert_equal "Hutspot", response.parsed_body["title"]
    assert_equal "pending", response.parsed_body["status"]
    assert Recipe.last.pending?
  end

  test "create ignores a submitted status" do
    post api_recipes_url, params: { recipe: recipe_params(title: "Sneaky", status: "approved") }, as: :json

    assert_response :created
    assert Recipe.find(response.parsed_body["id"]).pending?
  end

  test "create with ingredients and steps keeps the submitted order" do
    post api_recipes_url, params: { recipe: recipe_params(
      recipe_ingredients_attributes: [
        { ingredient_name: "  Wortel ", quantity: "1000", unit: "g" },
        { ingredient_name: "ui", quantity: 2, unit: "stuks", note: "grof gesneden" },
        { ingredient_name: "peper", quantity: "", unit: "g" }
      ],
      steps_attributes: [ { body: "Schillen." }, { body: "Koken." }, { body: "Stampen." } ]
    ) }, as: :json

    assert_response :created
    body = response.parsed_body
    assert_equal [ [ 1, "Schillen." ], [ 2, "Koken." ], [ 3, "Stampen." ] ],
      body["steps"].map { |step| [ step["position"], step["body"] ] }
    assert_equal [
      { "name" => "wortel", "quantity" => 1000, "unit" => "g", "note" => nil },
      { "name" => "ui", "quantity" => 2, "unit" => "stuks", "note" => "grof gesneden" },
      { "name" => "peper", "quantity" => nil, "unit" => nil, "note" => nil }
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
    assert_equal [ "must be greater than 0" ], errors["recipe_ingredients[1].quantity"]
    assert_equal [ "is not included in the list" ], errors["recipe_ingredients[1].unit"]
    assert_equal [ "can't be blank" ], errors["steps[1].body"]
    assert_not errors.key?("recipe_ingredients[0].ingredient_name")
  end

  test "create without ingredients and steps returns 422" do
    post api_recipes_url, params: { recipe: recipe_params(recipe_ingredients_attributes: [], steps_attributes: []) }, as: :json

    assert_response :unprocessable_content
    assert_equal [ "can't be blank" ], response.parsed_body["errors"]["steps"]
    assert_equal [ "can't be blank" ], response.parsed_body["errors"]["recipe_ingredients"]
  end

  test "create with too many steps returns 422" do
    post api_recipes_url, params: { recipe: recipe_params(steps_attributes: (1..31).map { |i| { body: "Stap #{i}" } }) }, as: :json

    assert_response :unprocessable_content
    assert_equal [ "has too many rows (maximum is 30)" ], response.parsed_body["errors"]["steps"]
  end

  test "create with far too many rows returns 422 without building them" do
    assert_no_difference("Recipe.count") do
      post api_recipes_url, params: { recipe: recipe_params(steps_attributes: (1..101).map { |i| { body: "Stap #{i}" } }) }, as: :json
    end

    assert_response :unprocessable_content
    assert_equal [ "has too many rows" ], response.parsed_body["errors"]["base"]
  end

  test "create without title returns 422 with errors" do
    assert_no_difference("Recipe.count") do
      post api_recipes_url, params: { recipe: recipe_params(title: "") }, as: :json
    end

    assert_response :unprocessable_content
    assert_includes response.parsed_body["errors"]["title"], "can't be blank"
  end

  test "create is rate limited per IP" do
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
  test "update and destroy are not publicly routed" do
    patch api_recipe_url(@recipe), params: { recipe: { title: "Gehackt" } }, as: :json
    assert_response :not_found

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

    def count_queries(&block)
      count = 0
      counter = ->(*, payload) { count += 1 unless payload[:name].in?([ "SCHEMA", "TRANSACTION" ]) }
      ActiveSupport::Notifications.subscribed(counter, "sql.active_record", &block)
      count
    end
end
