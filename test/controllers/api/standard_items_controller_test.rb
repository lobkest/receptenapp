require "test_helper"

class Api::StandardItemsControllerTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear # reset rate_limit counters
    @original_admin_token = ENV["ADMIN_TOKEN"]
    ENV["ADMIN_TOKEN"] = "test-admin-token"
    @melk = standard_items(:melk)
  end

  teardown do
    ENV["ADMIN_TOKEN"] = @original_admin_token
  end

  # Public since the standard list moved out of /api/admin: no code needed, and the old
  # admin paths are gone.

  test "every endpoint works without a code" do
    get api_standard_items_url, as: :json
    assert_response :ok

    post api_standard_items_url, params: { standard_item: { name: "brood" } }, as: :json
    assert_response :created

    patch api_standard_item_url(@melk), params: { standard_item: { name: "karnemelk" } }, as: :json
    assert_response :ok

    post bulk_destroy_api_standard_items_url, params: { ids: [ standard_items(:kaas).id ] }, as: :json
    assert_response :ok

    delete api_standard_item_url(@melk), as: :json
    assert_response :no_content
  end

  test "the old admin paths no longer exist, even with a valid code" do
    get "/api/admin/standard_items", headers: { "Authorization" => "Bearer test-admin-token" }, as: :json

    assert_response :not_found
  end

  test "writes count towards the shared public limit, reads do not" do
    limit = PublicWriteRateLimit::WRITES_PER_MINUTE
    limit.times { |i| post api_standard_items_url, params: { standard_item: { name: "item #{i}" } }, as: :json }
    assert_response :created

    post api_standard_items_url, params: { standard_item: { name: "een te veel" } }, as: :json
    assert_response :too_many_requests

    get api_standard_items_url, as: :json
    assert_response :ok
  end

  # index

  test "index lists all items by name" do
    get api_standard_items_url, as: :json

    assert_response :ok
    assert_equal [
      { "id" => standard_items(:kaas).id, "name" => "kaas", "category" => "zuivel" },
      { "id" => @melk.id, "name" => "melk", "category" => "zuivel" },
      { "id" => standard_items(:wc_papier).id, "name" => "wc-papier", "category" => nil }
    ], response.parsed_body
  end

  # create

  test "create normalizes and returns the new item" do
    assert_difference("StandardItem.count", 1) do
      post api_standard_items_url, params: { standard_item: { name: " Banaan ", category: " Groente " } }, as: :json
    end

    assert_response :created
    assert_equal({ "name" => "banaan", "category" => "groente" }, response.parsed_body.except("id"))
  end

  test "create refuses a duplicate name with a Dutch message" do
    assert_no_difference("StandardItem.count") do
      post api_standard_items_url, params: { standard_item: { name: "MELK" } }, as: :json
    end

    assert_response :unprocessable_content
    assert_equal [ "is al in gebruik" ], response.parsed_body["errors"]["name"]
  end

  test "create without a name returns 422" do
    post api_standard_items_url, params: { standard_item: { name: "", category: "zuivel" } }, as: :json

    assert_response :unprocessable_content
    assert_equal [ "moet opgegeven zijn" ], response.parsed_body["errors"]["name"]
  end

  # update

  test "update changes name and category; an empty category becomes nil" do
    patch api_standard_item_url(@melk), params: { standard_item: { name: "Volle melk", category: "" } }, as: :json

    assert_response :ok
    assert_equal({ "id" => @melk.id, "name" => "volle melk", "category" => nil }, response.parsed_body)
    assert_equal "volle melk", @melk.reload.name
  end

  test "update refuses the name of another item" do
    patch api_standard_item_url(@melk), params: { standard_item: { name: "kaas" } }, as: :json

    assert_response :unprocessable_content
    assert_equal "melk", @melk.reload.name
  end

  test "update of an unknown item returns 404" do
    patch api_standard_item_url(id: 0), params: { standard_item: { name: "x" } }, as: :json

    assert_response :not_found
    assert_equal "Standard item not found", response.parsed_body["error"]
  end

  # destroy

  test "destroy deletes one item" do
    assert_difference("StandardItem.count", -1) do
      delete api_standard_item_url(@melk), as: :json
    end

    assert_response :no_content
    assert_not StandardItem.exists?(@melk.id)
  end

  # bulk_destroy

  test "bulk_destroy deletes only the given ids" do
    kaas, wc_papier = standard_items(:kaas), standard_items(:wc_papier)

    assert_difference("StandardItem.count", -2) do
      post bulk_destroy_api_standard_items_url, params: { ids: [ @melk.id, wc_papier.id ] }, as: :json
    end

    assert_response :ok
    assert_equal [ @melk.id, wc_papier.id ].sort, response.parsed_body["deleted_ids"].sort
    assert_equal [ kaas.id ], StandardItem.pluck(:id)
  end

  test "bulk_destroy skips ids that do not exist" do
    assert_difference("StandardItem.count", -1) do
      post bulk_destroy_api_standard_items_url, params: { ids: [ @melk.id, 0 ] }, as: :json
    end

    assert_equal [ @melk.id ], response.parsed_body["deleted_ids"]
  end

  test "bulk_destroy without ids returns 400 and deletes nothing" do
    [ {}, { ids: [] }, { ids: "alles" } ].each do |params|
      assert_no_difference("StandardItem.count") do
        post bulk_destroy_api_standard_items_url, params: params, as: :json
      end
      assert_response :bad_request, params.inspect
    end
  end

  test "bulk_destroy is all or nothing" do
    # Items are deleted in id order. The last one refuses; the first, already deleted,
    # must come back.
    first_id, last_id = [ @melk.id, standard_items(:kaas).id ].sort
    StandardItem.before_destroy { throw :abort if id == last_id }

    assert_no_difference("StandardItem.count") do
      post bulk_destroy_api_standard_items_url, params: { ids: [ first_id, last_id ] }, as: :json
    end
    assert_response :unprocessable_content
    assert StandardItem.exists?(first_id)
  ensure
    StandardItem.reset_callbacks(:destroy)
  end
end
