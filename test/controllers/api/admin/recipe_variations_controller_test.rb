require "test_helper"

# Only with the admin code: a variation with a deletion request is deleted for good or put back.
class Api::Admin::RecipeVariationsControllerTest < ActionDispatch::IntegrationTest
  TEST_TOKEN = "test-admin-token"

  setup do
    @original_admin_token = ENV["ADMIN_TOKEN"]
    ENV["ADMIN_TOKEN"] = TEST_TOKEN
    Rails.cache.clear # reset rate_limit counters
    @requested = recipe_variations(:glutenvrij) # deletion requested
    @visible = recipe_variations(:spek)
  end

  teardown do
    ENV["ADMIN_TOKEN"] = @original_admin_token
  end

  test "without a valid code nothing happens" do
    [ {}, auth_headers("wrong-token") ].each do |headers|
      delete api_admin_variation_url(@requested), headers: headers, as: :json
      assert_response :unauthorized
      patch restore_api_admin_variation_url(@requested), headers: headers, as: :json
      assert_response :unauthorized
    end
    assert @requested.reload.deletion_requested?
  end

  test "restore makes the variation visible again" do
    patch restore_api_admin_variation_url(@requested), headers: auth_headers, as: :json

    assert_response :ok
    assert_equal [ @requested.id, "Glutenvrij" ], response.parsed_body.values_at("id", "name")
    assert_not @requested.reload.deletion_requested?
    assert_nil @requested.deletion_reason

    get api_recipe_url(@requested.recipe), as: :json
    assert_includes response.parsed_body["variations"].pluck("name"), "Glutenvrij"
  end

  test "destroy deletes the variation with its changes, and the recipe keeps a version of it" do
    assert_difference([ "RecipeVariation.count", "VariationChange.count" ], -1) do
      delete api_admin_variation_url(@requested), headers: auth_headers, as: :json
    end

    assert_response :no_content
    recipe = @requested.recipe
    assert_equal "Gewijzigd: variaties", recipe.versions.newest_first.first.summary
    assert_includes recipe.versions.newest_first.second.snapshot["variations"].pluck("name"), "Glutenvrij"
  end

  test "a visible variation cannot be deleted or restored by the admin" do
    delete api_admin_variation_url(@visible), headers: auth_headers, as: :json
    assert_response :not_found

    patch restore_api_admin_variation_url(@visible), headers: auth_headers, as: :json
    assert_response :not_found
    assert RecipeVariation.exists?(@visible.id)
  end

  private
    def auth_headers(token = TEST_TOKEN)
      { "Authorization" => "Bearer #{token}" }
    end
end
