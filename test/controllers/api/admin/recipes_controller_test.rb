require "test_helper"

class Api::Admin::RecipesControllerTest < ActionDispatch::IntegrationTest
  TEST_TOKEN = "test-admin-token"

  setup do
    @original_admin_token = ENV["ADMIN_TOKEN"]
    ENV["ADMIN_TOKEN"] = TEST_TOKEN
    @pending = recipes(:erwtensoep)
  end

  teardown do
    ENV["ADMIN_TOKEN"] = @original_admin_token
  end

  # Authentication

  test "without token returns 401" do
    get api_admin_recipes_url, as: :json

    assert_response :unauthorized
    assert_equal "Unauthorized", response.parsed_body["error"]
    assert_match "Bearer", response.headers["WWW-Authenticate"]
  end

  test "with wrong token returns 401" do
    get api_admin_recipes_url, headers: auth_headers("wrong-token"), as: :json

    assert_response :unauthorized
  end

  test "without ADMIN_TOKEN configured everything is refused" do
    ENV.delete("ADMIN_TOKEN")

    get api_admin_recipes_url, headers: auth_headers(TEST_TOKEN), as: :json
    assert_response :unauthorized

    ENV["ADMIN_TOKEN"] = ""

    get api_admin_recipes_url, headers: { "Authorization" => "Bearer " }, as: :json
    assert_response :unauthorized
  end

  test "unauthenticated requests cannot change anything" do
    patch approve_api_admin_recipe_url(@pending), as: :json

    assert_response :unauthorized
    assert @pending.reload.pending?
  end

  test "authorization header is filtered from logs" do
    filter = ActiveSupport::ParameterFilter.new(Rails.application.config.filter_parameters)

    assert_equal "[FILTERED]", filter.filter("HTTP_AUTHORIZATION" => "Bearer #{TEST_TOKEN}")["HTTP_AUTHORIZATION"]
  end

  # Listing

  test "index with correct token returns all recipes" do
    get api_admin_recipes_url, headers: auth_headers, as: :json

    assert_response :ok
    titles = response.parsed_body.map { |r| r["title"] }
    assert_equal %w[ Erwtensoep Pannenkoeken Stamppot ], titles.sort
  end

  test "index filters on status" do
    get api_admin_recipes_url(status: "pending"), headers: auth_headers, as: :json

    assert_response :ok
    assert_equal [ "Erwtensoep" ], response.parsed_body.map { |r| r["title"] }
  end

  test "index with unknown status returns 400" do
    get api_admin_recipes_url(status: "banaan"), headers: auth_headers, as: :json

    assert_response :bad_request
  end

  test "show returns a pending recipe" do
    get api_admin_recipe_url(@pending), headers: auth_headers, as: :json

    assert_response :ok
    assert_equal "pending", response.parsed_body["status"]
  end

  test "show with unknown id returns 404" do
    get api_admin_recipe_url(id: 0), headers: auth_headers, as: :json

    assert_response :not_found
  end

  # Moderation

  test "approve makes the recipe publicly visible" do
    patch approve_api_admin_recipe_url(@pending), headers: auth_headers, as: :json

    assert_response :ok
    assert_equal "approved", response.parsed_body["status"]

    get api_recipes_url, as: :json
    assert_includes response.parsed_body.map { |r| r["title"] }, "Erwtensoep"

    get api_recipe_url(@pending), as: :json
    assert_response :ok
  end

  test "reject keeps the recipe hidden" do
    patch reject_api_admin_recipe_url(@pending), headers: auth_headers, as: :json

    assert_response :ok
    assert @pending.reload.rejected?

    get api_recipes_url, as: :json
    assert_not_includes response.parsed_body.map { |r| r["title"] }, "Erwtensoep"

    get api_recipe_url(@pending), as: :json
    assert_response :not_found
  end

  # Editing

  test "update changes the recipe but not its status" do
    patch api_admin_recipe_url(@pending), params: { recipe: { title: "Snert", status: "approved" } },
      headers: auth_headers, as: :json

    assert_response :ok
    @pending.reload
    assert_equal "Snert", @pending.title
    assert @pending.pending?
  end

  test "update with invalid data returns 422" do
    patch api_admin_recipe_url(@pending), params: { recipe: { servings: 0 } }, headers: auth_headers, as: :json

    assert_response :unprocessable_content
    assert response.parsed_body["errors"].key?("servings")
  end

  test "show includes ingredients and steps, also for an older recipe without them" do
    get api_admin_recipe_url(recipes(:pannenkoeken)), headers: auth_headers, as: :json
    assert_equal 3, response.parsed_body["steps"].size
    assert_equal 4, response.parsed_body["ingredients"].size

    get api_admin_recipe_url(@pending), headers: auth_headers, as: :json
    assert_equal [], response.parsed_body["steps"]
    assert_equal [], response.parsed_body["ingredients"]
  end

  test "update of an older recipe without ingredients or steps stays possible" do
    patch api_admin_recipe_url(@pending), params: { recipe: { description: "Dikke soep" } },
      headers: auth_headers, as: :json

    assert_response :ok
    assert_equal "Dikke soep", @pending.reload.description
  end

  test "update can add ingredients and steps to an older recipe" do
    patch api_admin_recipe_url(@pending), params: { recipe: {
      recipe_ingredients_attributes: [ { ingredient_name: "spliterwten", quantity: 500, unit: "g" } ],
      steps_attributes: [ { body: "Erwten wassen." }, { body: "Twee uur koken." } ]
    } }, headers: auth_headers, as: :json

    assert_response :ok
    assert_equal [ "Erwten wassen.", "Twee uur koken." ], response.parsed_body["steps"].map { |s| s["body"] }
  end

  test "update reorders, edits and removes rows" do
    recipe = recipes(:pannenkoeken)
    beslag, melk, bakken = recipe.steps.to_a

    patch api_admin_recipe_url(recipe), params: { recipe: {
      steps_attributes: [ { id: bakken.id, body: "Bakken in boter." }, { id: melk.id, _destroy: "1" }, { id: beslag.id } ],
      recipe_ingredients_attributes: [ { id: recipe_ingredients(:pannenkoeken_zout).id, _destroy: "1" } ]
    } }, headers: auth_headers, as: :json

    assert_response :ok
    assert_equal [ [ 1, "Bakken in boter." ], [ 2, beslag.body ] ],
      response.parsed_body["steps"].map { |s| [ s["position"], s["body"] ] }
    assert_not_includes response.parsed_body["ingredients"].map { |i| i["name"] }, "zout"
  end

  # The body the admin form sends: kept rows in form order, new rows without id,
  # removed rows as _destroy at the end.
  test "update saves reordered, edited, added and removed rows in one request" do
    recipe = recipes(:pannenkoeken)
    beslag, melk, bakken = recipe.steps.to_a
    bloem, ei, zout = recipe_ingredients(:pannenkoeken_bloem), recipe_ingredients(:pannenkoeken_ei), recipe_ingredients(:pannenkoeken_zout)

    assert_no_difference("Step.count") do
      patch api_admin_recipe_url(recipe), params: { recipe: {
        title: recipe.title, description: recipe.description, servings: recipe.servings,
        steps_attributes: [
          { id: bakken.id, body: "Bak in boter." },
          { body: "Laat het beslag rusten." },
          { id: beslag.id, body: beslag.body },
          { id: melk.id, _destroy: true }
        ],
        recipe_ingredients_attributes: [
          { id: bloem.id, ingredient_name: "bloem", quantity: 300, unit: "g", optional: true },
          { id: ei.id, ingredient_name: "ei", quantity: 2, unit: "stuks" },
          { ingredient_name: "suiker", quantity: 25, unit: "g" },
          { id: zout.id, _destroy: true }
        ]
      } }, headers: auth_headers, as: :json
    end

    assert_response :ok
    expected_steps = [ [ 1, "Bak in boter." ], [ 2, "Laat het beslag rusten." ], [ 3, beslag.body ] ]
    assert_equal expected_steps, response.parsed_body["steps"].map { |s| [ s["position"], s["body"] ] }
    assert_equal expected_steps, recipe.reload.steps.map { |s| [ s.position, s.body ] }
    assert_equal bakken.id, recipe.steps.first.id
    assert_not Step.exists?(melk.id)

    # Ingredients have no position (sorted by id, and fixture ids are hashes), so compare without order.
    assert_equal({ "bloem" => 300, "melk" => 500, "ei" => 2, "suiker" => 25 },
      recipe.recipe_ingredients.to_h { |row| [ row.ingredient_name, row.quantity ] })
    assert bloem.reload.optional
    assert_not RecipeIngredient.exists?(zout.id)
    assert Ingredient.exists?(name: "zout"), "the ingredient itself stays"
  end

  test "update reports a row error with its index in the request, also with removed rows" do
    recipe = recipes(:pannenkoeken)
    beslag, melk, bakken = recipe.steps.to_a

    patch api_admin_recipe_url(recipe), params: { recipe: {
      steps_attributes: [ { id: beslag.id, body: beslag.body }, { id: bakken.id, body: "" }, { id: melk.id, _destroy: true } ]
    } }, headers: auth_headers, as: :json

    assert_response :unprocessable_content
    assert_equal [ "steps[1].body" ], response.parsed_body["errors"].keys
    assert_equal [ beslag.id, melk.id, bakken.id ], recipe.reload.steps.map(&:id)
  end

  test "update cannot remove the last step" do
    recipe = recipes(:pannenkoeken)

    patch api_admin_recipe_url(recipe), params: { recipe: {
      steps_attributes: recipe.steps.map { |step| { id: step.id, _destroy: "1" } }
    } }, headers: auth_headers, as: :json

    assert_response :unprocessable_content
    assert_equal [ "can't be blank" ], response.parsed_body["errors"]["steps"]
    assert_equal 3, recipe.steps.count
  end

  test "destroy removes the recipe" do
    assert_difference("Recipe.count", -1) do
      delete api_admin_recipe_url(@pending), headers: auth_headers, as: :json
    end

    assert_response :no_content
  end

  private
    def auth_headers(token = TEST_TOKEN)
      { "Authorization" => "Bearer #{token}" }
    end
end
