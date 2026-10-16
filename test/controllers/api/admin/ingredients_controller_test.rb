require "test_helper"

class Api::Admin::IngredientsControllerTest < ActionDispatch::IntegrationTest
  TEST_TOKEN = "test-admin-token"

  setup do
    @original_admin_token = ENV["ADMIN_TOKEN"]
    ENV["ADMIN_TOKEN"] = TEST_TOKEN
    Rails.cache.clear # reset rate_limit counters
    @eieren = Ingredient.create!(name: "eieren")
    recipes(:stamppot).recipe_ingredients.create!(ingredient: @eieren, quantity: 3, unit: "stuks")
  end

  teardown do
    ENV["ADMIN_TOKEN"] = @original_admin_token
  end

  test "merge needs the admin code" do
    post merge_api_admin_ingredient_url(@eieren), params: { target_id: ingredients(:ei).id }, as: :json
    assert_response :unauthorized

    post merge_api_admin_ingredient_url(@eieren), params: { target_id: ingredients(:ei).id },
      headers: auth_headers("fout"), as: :json
    assert_response :unauthorized
    assert Ingredient.exists?(@eieren.id)
  end

  test "merge moves everything and answers with the target and what happened" do
    post merge_api_admin_ingredient_url(@eieren), params: { target_id: ingredients(:ei).id }, headers: auth_headers, as: :json

    assert_response :ok
    body = response.parsed_body
    assert_equal "ei", body["target"]["name"]
    assert body["source_deleted"]
    assert_equal [ "Stamppot" ], body["moved_recipes"]
    assert_equal [], body["skipped_recipes"]
    refute Ingredient.exists?(@eieren.id)
  end

  test "into itself: 422; an unknown target: 404" do
    post merge_api_admin_ingredient_url(@eieren), params: { target_id: @eieren.id }, headers: auth_headers, as: :json
    assert_response :unprocessable_content
    assert_equal [ "target_id" ], response.parsed_body["errors"].keys

    post merge_api_admin_ingredient_url(@eieren), params: { target_id: 0 }, headers: auth_headers, as: :json
    assert_response :not_found
  end

  private
    def auth_headers(token = TEST_TOKEN)
      { "Authorization" => "Bearer #{token}" }
    end
end
