require "test_helper"

# Public: POST /api/recipes/:id/request_deletion hides a recipe at once.
class Api::DeletionRequestsTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear # reset rate_limit counters
    @recipe = recipes(:pannenkoeken) # tags vega and zoet
  end

  test "a deletion request hides the recipe everywhere for the public" do
    post request_deletion_api_recipe_url(@recipe), params: { reason: "  Staat er   dubbel in " }, as: :json

    assert_response :no_content
    @recipe.reload
    assert @recipe.deletion_requested?
    assert_equal "Staat er dubbel in", @recipe.deletion_reason

    get api_recipes_url, as: :json
    assert_not_includes response.parsed_body.pluck("id"), @recipe.id

    get api_recipes_url(tags: "vega"), as: :json
    assert_empty response.parsed_body

    get api_recipe_url(@recipe), as: :json
    assert_response :not_found

    get api_tags_url, as: :json
    assert_not_includes response.parsed_body.pluck("name"), "zoet"
  end

  test "the reason is optional, and the recipe itself stays in the database" do
    assert_no_difference("Recipe.count") do
      post request_deletion_api_recipe_url(@recipe), as: :json
    end

    assert_response :no_content
    assert_nil @recipe.reload.deletion_reason
  end

  test "a reason over 500 characters is refused, and the recipe stays visible" do
    post request_deletion_api_recipe_url(@recipe), params: { reason: "a" * 501 }, as: :json

    assert_response :unprocessable_content
    assert response.parsed_body["errors"].key?("deletion_reason")
    assert_not @recipe.reload.deletion_requested?
  end

  test "a hidden recipe cannot be requested again" do
    post request_deletion_api_recipe_url(recipes(:erwtensoep)), as: :json

    assert_response :not_found
  end

  test "a deletion request makes no new version" do
    RecipeVersion.record!(@recipe)

    assert_no_difference("RecipeVersion.count") do
      post request_deletion_api_recipe_url(@recipe), as: :json
    end
  end
end
