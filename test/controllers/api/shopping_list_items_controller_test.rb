require "test_helper"

class Api::ShoppingListItemsControllerTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear # reset rate_limit counters
    @bloem = shopping_list_items(:bloem)
    @zout = shopping_list_items(:zout)
    @melk = shopping_list_items(:melk)
  end

  # index

  test "index lists every item in the order it was added, without a code" do
    get api_shopping_list_items_url, as: :json

    assert_response :ok
    assert_equal [ @bloem.id, @zout.id, @melk.id ].sort, response.parsed_body.map { |item| item["id"] }
    assert_equal({
      "id" => @bloem.id, "name" => "bloem", "quantity" => 250, "unit" => "g",
      "source_label" => "Pannenkoeken", "recipe_id" => recipes(:pannenkoeken).id,
      "ingredient_id" => ingredients(:bloem).id, "checked" => false
    }, response.parsed_body.find { |item| item["id"] == @bloem.id })
  end

  test "index sends a decimal quantity as a number" do
    @bloem.update!(quantity: 0.5)

    get api_shopping_list_items_url, as: :json

    assert_equal 0.5, response.parsed_body.find { |item| item["id"] == @bloem.id }["quantity"]
  end

  # create, one item

  test "create adds a new item with a comma quantity" do
    assert_difference("ShoppingListItem.count", 1) do
      post api_shopping_list_items_url, params: { shopping_list_item: {
        name: " Gist ", quantity: "7,5", unit: "g", source_label: "Brood", recipe_id: recipes(:pannenkoeken).id
      } }, as: :json
    end

    assert_response :created
    assert_equal({ "name" => "gist", "quantity" => 7.5, "unit" => "g", "source_label" => "Brood", "checked" => false },
      response.parsed_body.slice("name", "quantity", "unit", "source_label", "checked"))
  end

  test "create adds a new line even when the same name and unit is already on the list" do
    @bloem.update!(checked: true)

    assert_difference("ShoppingListItem.count", 1) do
      post api_shopping_list_items_url, params: { shopping_list_item: {
        name: "bloem", quantity: 100, unit: "g", source_label: "Wafels", recipe_id: recipes(:pannenkoeken).id
      } }, as: :json
    end

    assert_response :created
    assert_not_equal @bloem.id, response.parsed_body["id"]
    assert_equal({ "quantity" => 100, "source_label" => "Wafels", "checked" => false },
      response.parsed_body.slice("quantity", "source_label", "checked"))
    @bloem.reload
    assert_equal [ 250, "Pannenkoeken", true ], [ @bloem.quantity, @bloem.source_label, @bloem.checked ]
  end

  test "create refuses an invalid item with Dutch messages" do
    assert_no_difference("ShoppingListItem.count") do
      post api_shopping_list_items_url, params: { shopping_list_item: { name: "", quantity: "abc", unit: "g" } }, as: :json
    end

    assert_response :unprocessable_content
    assert_equal [ "moet opgegeven zijn" ], response.parsed_body["errors"]["name"]
    assert_equal [ "is geen getal" ], response.parsed_body["errors"]["quantity"]
  end

  test "create with an unknown recipe returns 422, not 500" do
    post api_shopping_list_items_url, params: { shopping_list_item: { name: "ui", recipe_id: 0 } }, as: :json

    assert_response :unprocessable_content
    assert response.parsed_body["errors"].key?("recipe")
  end

  test "create without an item returns 400" do
    post api_shopping_list_items_url, params: {}, as: :json

    assert_response :bad_request
  end

  # create, several items ("Alles op lijst")

  test "create adds several items in one request, each as its own line" do
    assert_difference("ShoppingListItem.count", 4) do
      post api_shopping_list_items_url, params: { shopping_list_items: [
        { name: "bloem", quantity: "50", unit: "g", source_label: "Wafels", recipe_id: recipes(:pannenkoeken).id },
        { name: "ei", quantity: 2, unit: "stuks", source_label: "Wafels" },
        { name: "ei", quantity: 1, unit: "stuks", source_label: "Pannenkoeken" },
        { name: "suiker", source_label: "Wafels" }
      ] }, as: :json
    end

    assert_response :created
    body = response.parsed_body
    assert_equal [ "bloem", "ei", "ei", "suiker" ], body.map { |item| item["name"] }
    assert_equal [ 50, 2, 1, nil ], body.map { |item| item["quantity"] }
    assert_equal [ "Wafels", "Wafels", "Pannenkoeken", "Wafels" ], body.map { |item| item["source_label"] }
    assert_equal [ recipes(:pannenkoeken).id, nil, nil, nil ], body.map { |item| item["recipe_id"] }
    assert_equal 250, @bloem.reload.quantity, "the existing bloem line is left alone"
  end

  test "create with several items is all or nothing and names the bad one" do
    assert_no_difference("ShoppingListItem.count") do
      post api_shopping_list_items_url, params: { shopping_list_items: [
        { name: "bloem", quantity: 50, unit: "g" },
        { name: "ei", quantity: 2, unit: "stuks" },
        { name: "", quantity: 1, unit: "stuks" }
      ] }, as: :json
    end

    assert_response :unprocessable_content
    assert_equal [ "moet opgegeven zijn" ], response.parsed_body["errors"]["shopping_list_items[2].name"]
  end

  test "create refuses too many items at once" do
    items = Array.new(Api::ShoppingListItemsController::MAX_ITEMS_PER_REQUEST + 1) { |i| { name: "item #{i}" } }

    assert_no_difference("ShoppingListItem.count") do
      post api_shopping_list_items_url, params: { shopping_list_items: items }, as: :json
    end
    assert_response :unprocessable_content
  end

  test "create with an empty list returns 400" do
    post api_shopping_list_items_url, params: { shopping_list_items: [] }, as: :json

    assert_response :bad_request
  end

  # update

  test "update checks and unchecks an item" do
    patch api_shopping_list_item_url(@bloem), params: { shopping_list_item: { checked: true } }, as: :json

    assert_response :ok
    assert_equal true, response.parsed_body["checked"]
    assert @bloem.reload.checked

    patch api_shopping_list_item_url(@bloem), params: { shopping_list_item: { checked: false } }, as: :json
    assert_not @bloem.reload.checked
  end

  # The offline queue in the frontend sends a value, never "toggle": sending the same
  # value twice (a retry after a lost connection) must leave the item as it is.
  test "update with the same checked value twice keeps that value" do
    2.times do
      patch api_shopping_list_item_url(@bloem), params: { shopping_list_item: { checked: true } }, as: :json

      assert_response :ok
      assert @bloem.reload.checked
    end
  end

  test "update renames an item, normalized" do
    patch api_shopping_list_item_url(@bloem), params: { shopping_list_item: { name: " Volkoren  Bloem " } }, as: :json

    assert_response :ok
    assert_equal "volkoren bloem", @bloem.reload.name
  end

  test "update ignores fields other than checked and name" do
    patch api_shopping_list_item_url(@bloem), params: { shopping_list_item: { checked: true, quantity: 1, unit: "stuks" } },
      as: :json

    assert_response :ok
    assert_equal 250, @bloem.reload.quantity
    assert_equal "g", @bloem.unit
  end

  test "update refuses an empty name" do
    patch api_shopping_list_item_url(@bloem), params: { shopping_list_item: { name: " " } }, as: :json

    assert_response :unprocessable_content
    assert_equal "bloem", @bloem.reload.name
  end

  test "update of an unknown item returns 404" do
    patch api_shopping_list_item_url(id: 0), params: { shopping_list_item: { checked: true } }, as: :json

    assert_response :not_found
    assert_equal "Boodschap niet gevonden.", response.parsed_body["error"]
  end

  # destroy, clear_checked, clear_all

  test "destroy deletes one item" do
    assert_difference("ShoppingListItem.count", -1) do
      delete api_shopping_list_item_url(@bloem), as: :json
    end

    assert_response :no_content
    assert_not ShoppingListItem.exists?(@bloem.id)
  end

  test "destroy of an unknown item returns 404" do
    delete api_shopping_list_item_url(id: 0), as: :json

    assert_response :not_found
  end

  test "clear_checked deletes only the checked items" do
    delete clear_checked_api_shopping_list_items_url, as: :json

    assert_response :no_content
    assert_equal [ @bloem.id, @zout.id ].sort, ShoppingListItem.pluck(:id).sort
  end

  test "clear_all deletes every item" do
    delete clear_all_api_shopping_list_items_url, as: :json

    assert_response :no_content
    assert_equal 0, ShoppingListItem.count
  end

  # Rate limit: every write counts, per IP, shared with the standard list.

  WRITES = {
    "create" => -> { [ :post, api_shopping_list_items_url, { shopping_list_item: { name: "brood" } } ] },
    "update" => -> { [ :patch, api_shopping_list_item_url(@bloem), { shopping_list_item: { checked: true } } ] },
    "destroy" => -> { [ :delete, api_shopping_list_item_url(id: 0), {} ] },
    "clear_checked" => -> { [ :delete, clear_checked_api_shopping_list_items_url, {} ] },
    "clear_all" => -> { [ :delete, clear_all_api_shopping_list_items_url, {} ] }
  }

  test "the default limit is 120 writes per minute" do
    assert_equal 120, PublicWriteRateLimit::WRITES_PER_MINUTE, "default without PUBLIC_WRITES_PER_MINUTE"
  end

  WRITES.each do |name, write|
    test "#{name} is rate limited per IP" do
      method, url, params = instance_exec(&write)
      PublicWriteRateLimit::WRITES_PER_MINUTE.times do
        public_send(method, url, params: params, as: :json)
        assert_not_equal 429, response.status
      end

      public_send(method, url, params: params, as: :json)
      assert_response :too_many_requests
      assert_equal "Te veel verzoeken. Probeer het over een minuut opnieuw.", response.parsed_body["error"]

      # Reading still works, and another IP has its own counter.
      get api_shopping_list_items_url, as: :json
      assert_response :ok
      public_send(method, url, params: params, as: :json, env: { "REMOTE_ADDR" => "203.0.113.7" })
      assert_not_equal 429, response.status
    end
  end

  test "the limit is shared with the standard list" do
    PublicWriteRateLimit::WRITES_PER_MINUTE.times do
      delete clear_checked_api_shopping_list_items_url, as: :json
    end

    post api_standard_items_url, params: { standard_item: { name: "brood" } }, as: :json

    assert_response :too_many_requests
  end
end
