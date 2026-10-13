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
      post api_recipes_url, params: { recipe: { title: "Hutspot", description: "Wortel en ui", servings: 6 } }, as: :json
    end

    assert_response :created
    assert_equal "Hutspot", response.parsed_body["title"]
    assert_equal "pending", response.parsed_body["status"]
    assert Recipe.last.pending?
  end

  test "create ignores a submitted status" do
    post api_recipes_url, params: { recipe: { title: "Sneaky", servings: 2, status: "approved" } }, as: :json

    assert_response :created
    assert Recipe.find(response.parsed_body["id"]).pending?
  end

  test "create without title returns 422 with errors" do
    assert_no_difference("Recipe.count") do
      post api_recipes_url, params: { recipe: { title: "", servings: 2 } }, as: :json
    end

    assert_response :unprocessable_content
    assert_includes response.parsed_body["errors"]["title"], "can't be blank"
  end

  test "create is rate limited per IP" do
    5.times do
      post api_recipes_url, params: { recipe: { title: "Spam", servings: 1 } }, as: :json
      assert_response :created
    end

    assert_no_difference("Recipe.count") do
      post api_recipes_url, params: { recipe: { title: "Spam", servings: 1 } }, as: :json
    end
    assert_response :too_many_requests

    post api_recipes_url, params: { recipe: { title: "Ander IP", servings: 1 } }, as: :json,
      env: { "REMOTE_ADDR" => "203.0.113.7" }
    assert_response :created
  end

  test "update and destroy are not publicly routed" do
    assert_raises(ActionController::RoutingError) do
      Rails.application.routes.recognize_path("/api/recipes/#{@recipe.id}", method: :patch)
    end
    assert_raises(ActionController::RoutingError) do
      Rails.application.routes.recognize_path("/api/recipes/#{@recipe.id}", method: :delete)
    end
  end
end
