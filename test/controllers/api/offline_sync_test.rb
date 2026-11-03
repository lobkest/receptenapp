require "test_helper"

# Offline changes reach the server later, and sometimes twice (the connection dropped after
# the server saved, before the answer came back). With the browser's uuid (client_id on a
# new row, client_action_id on a change the server works out) the second time adds nothing.
class Api::OfflineSyncTest < ActionDispatch::IntegrationTest
  UUID = "0b5e8a52-3c1f-4d2e-9a6b-7c8d9e0f1a2b".freeze
  OTHER_UUID = "5f0c2d1e-8b7a-4c3d-9e2f-1a0b9c8d7e6f".freeze

  setup do
    Rails.cache.clear # reset rate_limit counters
    @recipe = recipes(:pannenkoeken) # for 4: 250 g bloem, 500 ml melk, 2 stuks ei, zout (optional)
  end

  # ---------- client_id on creates ----------

  test "a shopping list line with a known client_id is returned, not added again" do
    item = { name: "appels", client_id: UUID }

    assert_difference("ShoppingListItem.count", 1) do
      post api_shopping_list_items_url, params: { shopping_list_item: item }, as: :json
    end
    assert_response :created
    first = response.parsed_body

    assert_no_difference("ShoppingListItem.count") do
      post api_shopping_list_items_url, params: { shopping_list_item: item }, as: :json
    end
    assert_response :ok
    assert_equal first["id"], response.parsed_body["id"]
  end

  test "several lines: the known ones come back, the new ones are added, in the order sent" do
    post api_shopping_list_items_url, params: { shopping_list_items: [ { name: "appels", client_id: UUID } ] }, as: :json
    appels = response.parsed_body.first["id"]

    assert_difference("ShoppingListItem.count", 1) do
      post api_shopping_list_items_url, as: :json,
        params: { shopping_list_items: [ { name: "appels", client_id: UUID }, { name: "peren", client_id: OTHER_UUID } ] }
    end
    assert_response :created
    assert_equal [ appels, ShoppingListItem.find_by!(client_id: OTHER_UUID).id ], response.parsed_body.pluck("id")

    assert_no_difference("ShoppingListItem.count") do
      post api_shopping_list_items_url, as: :json,
        params: { shopping_list_items: [ { name: "appels", client_id: UUID }, { name: "peren", client_id: OTHER_UUID } ] }
    end
    assert_response :ok
  end

  test "an invalid client_id is ignored, it never matches a line without one" do
    assert_difference("ShoppingListItem.count", 2) do
      2.times { post api_shopping_list_items_url, params: { shopping_list_item: { name: "appels", client_id: "geen-uuid" } }, as: :json }
    end
    assert_response :created
  end

  test "a standard item with a known client_id is returned with 200, not refused as a duplicate name" do
    assert_difference("StandardItem.count", 1) do
      post api_standard_items_url, params: { standard_item: { name: "brood", client_id: UUID } }, as: :json
    end
    assert_response :created
    id = response.parsed_body["id"]

    assert_no_difference("StandardItem.count") do
      post api_standard_items_url, params: { standard_item: { name: "brood", client_id: UUID } }, as: :json
    end
    assert_response :ok
    assert_equal id, response.parsed_body["id"]
  end

  test "a new standard item with an existing name and another client_id is still a 422" do
    post api_standard_items_url, params: { standard_item: { name: "melk", client_id: UUID } }, as: :json

    assert_response :unprocessable_content
  end

  # ---------- client_action_id on changes the server works out ----------

  test "Alles op lijst twice with the same client_action_id adds the lines once" do
    assert_difference("ShoppingListItem.count", 3) do
      post add_to_shopping_list_api_recipe_url(@recipe), params: { servings: 4, client_action_id: UUID }, as: :json
    end
    assert_response :created
    first = response.parsed_body.pluck("id").sort

    assert_no_difference("ShoppingListItem.count") do
      post add_to_shopping_list_api_recipe_url(@recipe), params: { servings: 4, client_action_id: UUID }, as: :json
    end
    assert_response :ok
    assert_equal first, response.parsed_body.pluck("id").sort

    assert_difference("ShoppingListItem.count", 3) do
      post add_to_shopping_list_api_recipe_url(@recipe), params: { servings: 4, client_action_id: OTHER_UUID }, as: :json
    end
  end

  test "an invalid addition is not remembered: sent again (fixed), it is added" do
    post add_to_shopping_list_api_recipe_url(@recipe), params: { servings: 0, client_action_id: UUID }, as: :json
    assert_response :unprocessable_content
    assert_not ClientAction.exists?(UUID)

    post add_to_shopping_list_api_recipe_url(@recipe), params: { servings: 4, client_action_id: UUID }, as: :json
    assert_response :created
  end

  test "skip_in_house: the stock of the server at that moment, after swapping" do
    PantryItem.set!(ingredients(:melk), true)

    post add_to_shopping_list_api_recipe_url(@recipe), params: { servings: 4, skip_in_house: true }, as: :json

    assert_response :created
    assert_equal %w[ bloem ei ], response.parsed_body.pluck("name").sort
  end

  test "skip_in_house for a variation also leaves out an addition that is in the house" do
    spek = recipe_variations(:spek) # without melk, with 100 g spek
    PantryItem.set!(ingredients(:spek), true)
    PantryItem.set!(ingredients(:ei), true)

    post add_to_shopping_list_api_recipe_variation_url(@recipe, spek), params: { servings: 4, skip_in_house: true }, as: :json

    assert_response :created
    assert_equal %w[ bloem ], response.parsed_body.pluck("name")
  end

  test "Variatie op lijst twice with the same client_action_id adds the lines once" do
    spek = recipe_variations(:spek)

    assert_difference("ShoppingListItem.count", 3) do
      2.times do
        post add_to_shopping_list_api_recipe_variation_url(@recipe, spek), params: { servings: 4, client_action_id: UUID }, as: :json
      end
    end
  end

  test "standard items by name (offline: an item without id yet), once per client_action_id" do
    ShoppingListItem.delete_all

    assert_difference("ShoppingListItem.count", 2) do
      post add_to_shopping_list_api_standard_items_url, params: { names: [ " Brood ", "melk" ], client_action_id: UUID }, as: :json
    end
    assert_response :ok
    assert_equal %w[ brood melk ], response.parsed_body.pluck("name")

    post add_to_shopping_list_api_standard_items_url, params: { names: [ "brood", "melk" ], client_action_id: UUID }, as: :json
    assert_equal [ 1, 1 ], ShoppingListItem.order(:name).pluck(:count)

    # Another tap (another uuid) counts one more, like online.
    post add_to_shopping_list_api_standard_items_url, params: { names: [ "melk" ], client_action_id: OTHER_UUID }, as: :json
    assert_equal 2, ShoppingListItem.find_by!(name: "melk").count
  end

  # ---------- a loose item typed on the list ----------

  test "a loose item: free text, with a count, no new ingredient" do
    ShoppingListItem.delete_all

    assert_no_difference("Ingredient.count") do
      post add_api_shopping_list_items_url, params: { name: " Wasmiddel ", count: 3 }, as: :json
    end

    assert_response :created
    line = response.parsed_body.sole
    assert_equal [ "wasmiddel", 3, ShoppingListItem::LOOSE_SOURCE, nil ], line.values_at("name", "count", "source_label", "ingredient_id")
  end

  test "a loose item for a picked ingredient is linked, and adds up on an open line without amount" do
    ShoppingListItem.delete_all
    ei = ingredients(:ei)

    post add_api_shopping_list_items_url, params: { name: "eieren", ingredient_id: ei.id, count: 2 }, as: :json
    line = response.parsed_body.sole
    assert_equal [ "ei", ei.id, 2 ], line.values_at("name", "ingredient_id", "count")

    assert_no_difference("ShoppingListItem.count") do
      post add_api_shopping_list_items_url, params: { name: "ei", ingredient_id: ei.id, count: 3 }, as: :json
    end
    assert_equal [ line["id"], 5 ], response.parsed_body.sole.values_at("id", "count")
  end

  test "a loose item does not add up on a line with an amount, or one that is ticked off" do
    ShoppingListItem.delete_all
    post add_to_shopping_list_api_recipe_url(@recipe), params: { servings: 4, ingredient_ids: [ recipe_ingredients(:pannenkoeken_bloem).id ] }, as: :json
    ShoppingListItem.create!(name: "bloem", checked: true)

    assert_difference("ShoppingListItem.count", 1) do
      post add_api_shopping_list_items_url, params: { name: "bloem", ingredient_id: ingredients(:bloem).id }, as: :json
    end
  end

  test "a loose item twice with the same client_action_id counts once" do
    ShoppingListItem.delete_all

    2.times { post add_api_shopping_list_items_url, params: { name: "appels", count: 2, client_action_id: UUID }, as: :json }

    assert_response :ok
    assert_equal [ [ "appels", 2 ] ], ShoppingListItem.pluck(:name, :count)
  end

  test "a loose item ticked off before it was sent is its own line, and goes in the house" do
    ShoppingListItem.delete_all
    post add_api_shopping_list_items_url, params: { name: "ei", ingredient_id: ingredients(:ei).id }, as: :json

    post add_api_shopping_list_items_url, params: { name: "ei", ingredient_id: ingredients(:ei).id, checked: true }, as: :json

    assert_equal [ false, true ], ShoppingListItem.order(:id).pluck(:checked)
    assert_includes PantryItem.present_ingredient_ids, ingredients(:ei).id
  end

  test "a loose item without a name, or with an odd count, is a 422 in the shared format" do
    post add_api_shopping_list_items_url, params: { name: " " }, as: :json
    assert_response :unprocessable_content
    assert response.parsed_body["errors"].key?("name")

    post add_api_shopping_list_items_url, params: { name: "appels", count: 100 }, as: :json
    assert_response :unprocessable_content
  end

  test "an unknown ingredient is a 404" do
    post add_api_shopping_list_items_url, params: { name: "x", ingredient_id: 0 }, as: :json

    assert_response :not_found
  end

  test "a client action is kept for a while, then cleaned up" do
    old = ClientAction.create!(id: OTHER_UUID, created_at: 31.days.ago)

    post add_api_shopping_list_items_url, params: { name: "appels", client_action_id: UUID }, as: :json

    assert_not ClientAction.exists?(old.id)
    assert ClientAction.exists?(UUID)
  end
end
