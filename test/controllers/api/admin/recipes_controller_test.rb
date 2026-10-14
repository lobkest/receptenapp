require "test_helper"

# Only with the admin code: deletion requests, deleting for good, putting back, versions.
class Api::Admin::RecipesControllerTest < ActionDispatch::IntegrationTest
  TEST_TOKEN = "test-admin-token"

  setup do
    @original_admin_token = ENV["ADMIN_TOKEN"]
    ENV["ADMIN_TOKEN"] = TEST_TOKEN
    Rails.cache.clear # reset rate_limit counters
    @requested = recipes(:erwtensoep) # deletion requested
    @visible = recipes(:pannenkoeken)
  end

  teardown do
    ENV["ADMIN_TOKEN"] = @original_admin_token
  end

  # Authentication: every admin endpoint, without a token and with a wrong one.

  ENDPOINTS = {
    "deletion_requests" => -> { [ :get, api_admin_deletion_requests_url ] },
    "destroy" => -> { [ :delete, api_admin_recipe_url(@requested) ] },
    "restore" => -> { [ :patch, restore_api_admin_recipe_url(@requested) ] },
    "versions" => -> { [ :get, api_admin_recipe_versions_url(@visible) ] },
    "restore version" => -> {
      [ :post, restore_api_admin_recipe_version_url(@visible, RecipeVersion.record!(@visible)) ]
    }
  }

  ENDPOINTS.each do |name, endpoint|
    test "#{name} without a valid code returns 401 and changes nothing" do
      method, url = instance_exec(&endpoint)

      [ {}, auth_headers("wrong-token") ].each do |headers|
        assert_no_difference([ "Recipe.count", "RecipeVersion.count" ]) do
          public_send(method, url, headers: headers, as: :json)
        end
        assert_response :unauthorized
      end
      assert @requested.reload.deletion_requested?
    end
  end

  # Rate limit: guessing the code. One counter per IP for all admin endpoints together.

  test "the 11th admin request within a minute gets a Dutch 429, whatever the code" do
    assert_equal 10, Api::Admin::BaseController::REQUESTS_PER_MINUTE, "default without ADMIN_REQUESTS_PER_MINUTE"

    5.times { get api_admin_deletion_requests_url, headers: auth_headers("guess"), as: :json }
    5.times { get api_admin_recipe_versions_url(@visible), headers: auth_headers("guess"), as: :json }
    assert_response :unauthorized

    # The 11th try is refused before the code is even checked, so the right code is
    # refused too: otherwise a guesser could keep trying until one does not get a 429.
    get api_admin_deletion_requests_url, headers: auth_headers, as: :json

    assert_response :too_many_requests
    assert_equal "Te veel pogingen. Wacht een minuut en probeer het opnieuw.", response.parsed_body["error"]
  end

  test "the admin limit is per IP" do
    10.times { get api_admin_deletion_requests_url, headers: auth_headers("guess"), as: :json }

    get api_admin_deletion_requests_url, headers: auth_headers, env: { "REMOTE_ADDR" => "203.0.113.7" }, as: :json

    assert_response :ok
  end

  test "without ADMIN_TOKEN configured everything is refused" do
    ENV["ADMIN_TOKEN"] = nil

    get api_admin_deletion_requests_url, headers: auth_headers, as: :json

    assert_response :unauthorized
  end

  # Deletion requests

  test "deletion_requests lists hidden recipes and variations, newest request first, with the reason" do
    @visible.request_deletion!("Lijkt op flensjes")

    get api_admin_deletion_requests_url, headers: auth_headers, as: :json

    assert_response :ok
    # Erwtensoep was requested an hour ago, the variation Glutenvrij two hours ago.
    assert_equal [ [ "recipe", "Pannenkoeken", "Lijkt op flensjes" ], [ "recipe", "Erwtensoep", "dubbel recept" ],
      [ "variation", "Glutenvrij", "werkt niet" ] ],
      response.parsed_body.map { |row| [ row["type"], row["title"], row["deletion_reason"] ] }
    assert_equal [ @visible.id, "Pannenkoeken" ], response.parsed_body.last.values_at("recipe_id", "recipe_title")
    assert response.parsed_body.first["deletion_requested_at"].present?
  end

  test "destroy deletes a requested recipe for good, with its rows and versions" do
    RecipeVersion.record!(@requested)

    # erwtensoep has two tags: soep and vega.
    assert_difference({ "Recipe.count" => -1, "RecipeVersion.count" => -1, "RecipeTag.count" => -2 }) do
      delete api_admin_recipe_url(@requested), headers: auth_headers, as: :json
    end

    assert_response :no_content
    assert_not Recipe.exists?(@requested.id)
    assert_equal 0, RecipeVersion.where(recipe_id: @requested.id).count
  end

  test "a visible recipe cannot be deleted for good, even with the code" do
    assert_no_difference("Recipe.count") do
      delete api_admin_recipe_url(@visible), headers: auth_headers, as: :json
    end

    assert_response :not_found
  end

  test "restore makes the recipe visible again and forgets the request" do
    patch restore_api_admin_recipe_url(@requested), headers: auth_headers, as: :json

    assert_response :ok
    @requested.reload
    assert_not @requested.deletion_requested?
    assert_nil @requested.deletion_reason

    get api_recipe_url(@requested), as: :json
    assert_response :ok
  end

  # Versions

  test "versions lists newest first, the first one marked current" do
    @visible.update!(title: "Flensjes")
    @visible.update!(servings: 6)

    get api_admin_recipe_versions_url(@visible), headers: auth_headers, as: :json

    assert_response :ok
    body = response.parsed_body
    assert_equal({ "id" => @visible.id, "title" => "Flensjes", "deletion_requested_at" => nil }, body["recipe"])
    assert_equal [ "Gewijzigd: porties", "Gewijzigd: titel", "Oorspronkelijke versie" ], body["versions"].pluck("summary")
    assert_equal [ true, false, false ], body["versions"].pluck("current")
  end

  test "restoring a version puts title, ingredients, steps and tags back, as a new version" do
    original = RecipeVersion.record!(@visible)
    @visible.update!(title: "Flensjes", tag_names: [ "snel" ],
      recipe_ingredients_attributes: [ { ingredient_name: "suiker", quantity: 10, unit: "g" } ],
      steps_attributes: [ { body: "Alleen bakken." } ])

    assert_difference("RecipeVersion.count", 1) do
      post restore_api_admin_recipe_version_url(@visible, original), headers: auth_headers, as: :json
    end

    assert_response :ok
    body = response.parsed_body
    assert_equal "Pannenkoeken", body["title"]
    assert_equal %w[ vega zoet ], body["tags"]
    assert_equal %w[ bloem ei melk zout ], body["ingredients"].pluck("name").sort
    assert_equal 3, body["steps"].size
    assert_match "Teruggezet naar de versie van", @visible.versions.newest_first.first.summary
  end

  test "restoring a version from before variations, whose tags a variation no longer fits, works" do
    old = RecipeVersion.record!(@visible)
    old.update_columns(snapshot: old.snapshot.except("variations").merge("tag_names" => [ "zoet" ]))

    post restore_api_admin_recipe_version_url(@visible, old), headers: auth_headers, as: :json

    assert_response :ok
    assert_equal [ "zoet" ], response.parsed_body["tags"]
    assert_equal [], response.parsed_body["variations"].find { |v| v["name"] == "Met spek" }["tag_changes"]
  end

  test "a version that the current rules refuse gives a Dutch 422, and nothing changes" do
    old = RecipeVersion.record!(@visible)
    old.update_columns(snapshot: old.snapshot.merge("title" => ""))

    assert_no_difference("RecipeVersion.count") do
      post restore_api_admin_recipe_version_url(@visible, old), headers: auth_headers, as: :json
    end

    assert_response :unprocessable_content
    assert_equal "Deze versie kan niet worden teruggezet: Titel moet opgegeven zijn",
      response.parsed_body["error"]
    assert_equal "Pannenkoeken", @visible.reload.title
  end

  test "a version of another recipe is not found" do
    other = RecipeVersion.record!(recipes(:stamppot))

    post restore_api_admin_recipe_version_url(@visible, other), headers: auth_headers, as: :json

    assert_response :not_found
  end

  private
    def auth_headers(token = TEST_TOKEN)
      { "Authorization" => "Bearer #{token}" }
    end
end
