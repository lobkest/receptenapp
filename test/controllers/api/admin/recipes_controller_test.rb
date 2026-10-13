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
