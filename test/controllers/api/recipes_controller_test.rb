require "test_helper"

class Api::RecipesControllerTest < ActionDispatch::IntegrationTest
  setup do
    @recipe = recipes(:pannenkoeken)
  end

  test "index returns a list of recipes" do
    get api_recipes_url, as: :json

    assert_response :ok
    assert_kind_of Array, response.parsed_body
    assert_includes response.parsed_body.map { |r| r["title"] }, "Pannenkoeken"
  end

  test "show returns the recipe" do
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

  test "create with valid data creates a recipe" do
    assert_difference("Recipe.count", 1) do
      post api_recipes_url, params: { recipe: { title: "Erwtensoep", description: "Snert", servings: 6 } }, as: :json
    end

    assert_response :created
    assert_equal "Erwtensoep", response.parsed_body["title"]
    assert_equal api_recipe_url(Recipe.last), response.location
  end

  test "create without title returns 422 with errors" do
    assert_no_difference("Recipe.count") do
      post api_recipes_url, params: { recipe: { title: "", servings: 2 } }, as: :json
    end

    assert_response :unprocessable_content
    assert_includes response.parsed_body["errors"]["title"], "can't be blank"
  end

  test "update changes the recipe" do
    patch api_recipe_url(@recipe), params: { recipe: { title: "Flensjes" } }, as: :json

    assert_response :ok
    assert_equal "Flensjes", @recipe.reload.title
  end

  test "update with invalid data returns 422" do
    patch api_recipe_url(@recipe), params: { recipe: { servings: 0 } }, as: :json

    assert_response :unprocessable_content
    assert response.parsed_body["errors"].key?("servings")
    assert_equal 4, @recipe.reload.servings
  end

  test "destroy removes the recipe" do
    assert_difference("Recipe.count", -1) do
      delete api_recipe_url(@recipe), as: :json
    end

    assert_response :no_content
    assert_empty response.body
  end
end
