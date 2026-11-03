require "test_helper"

# GET /api/offline_snapshot: everything the app shows offline, with an ETag so an unchanged
# snapshot is a 304 without a body.
class Api::OfflineSnapshotsControllerTest < ActionDispatch::IntegrationTest
  test "recipes in full, as the recipe page gets them, without hidden ones" do
    get api_offline_snapshot_url, as: :json

    assert_response :ok
    recipes = response.parsed_body["recipes"]
    assert_not_includes recipes.pluck("title"), "Erwtensoep"
    pannenkoeken = recipes.find { |recipe| recipe["id"] == recipes(:pannenkoeken).id }
    get api_recipe_url(recipes(:pannenkoeken)), as: :json
    assert_equal response.parsed_body, pannenkoeken
  end

  test "per-ingredient nutrition comes with the recipe, not the NEVO table" do
    get api_offline_snapshot_url, as: :json

    body = response.parsed_body
    assert_not_includes body.keys, "nevo_foods"
    pannenkoeken = body["recipes"].find { |recipe| recipe["id"] == recipes(:pannenkoeken).id }
    assert_includes pannenkoeken["nutrition"]["lines"].pluck("name"), "bloem"
  end

  test "tags, categories, ingredient names, standard list and stock, like their own endpoints" do
    get api_offline_snapshot_url, as: :json
    snapshot = response.parsed_body

    assert_equal [ { "id" => ingredients(:bloem).id, "name" => "bloem" } ],
      snapshot["ingredients"].select { |ingredient| ingredient["name"] == "bloem" }
    { "tags" => api_tags_url, "categories" => api_categories_url, "standard_items" => api_standard_items_url,
      "pantry" => api_pantry_url }.each do |key, url|
      get url, as: :json
      assert_equal response.parsed_body, snapshot[key], key
    end
    assert_not_includes snapshot.keys, "shopping_list_items"
  end

  test "the same ETag gives 304 without a body; a change gives a new snapshot" do
    get api_offline_snapshot_url, as: :json
    etag = response.headers["ETag"]
    assert etag.present?

    get api_offline_snapshot_url, headers: { "If-None-Match" => etag }, as: :json
    assert_response :not_modified
    assert_empty response.body

    StandardItem.create!(name: "brood")
    get api_offline_snapshot_url, headers: { "If-None-Match" => etag }, as: :json
    assert_response :ok
    assert_not_equal etag, response.headers["ETag"]
    assert_includes response.parsed_body["standard_items"].pluck("name"), "brood"
  end

  test "deleting a row or putting something in the house changes the ETag too" do
    get api_offline_snapshot_url, as: :json
    etag = response.headers["ETag"]

    PantryItem.set!(ingredients(:bloem), true)
    get api_offline_snapshot_url, headers: { "If-None-Match" => etag }, as: :json
    assert_response :ok
    etag = response.headers["ETag"]

    standard_items(:kaas).destroy!
    get api_offline_snapshot_url, headers: { "If-None-Match" => etag }, as: :json
    assert_response :ok
  end

  test "a 304 does not build the snapshot: a fixed number of queries" do
    get api_offline_snapshot_url, as: :json
    etag = response.headers["ETag"]

    queries = count_queries { get api_offline_snapshot_url, headers: { "If-None-Match" => etag }, as: :json }
    assert_response :not_modified
    assert_operator queries, :<=, 2
  end
end
