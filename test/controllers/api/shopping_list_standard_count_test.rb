require "test_helper"

# The standard list on the shopping list: a tap adds one (a new line, or +1 on a line that is
# already there), the minus button takes one off, and "✓ op lijst" on a recipe keeps what
# came from the standard list.
class Api::ShoppingListStandardCountTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear # reset rate_limit counters
  end

  def add_standard(*items)
    post add_to_shopping_list_api_standard_items_url, params: { ids: items.map(&:id) }, as: :json
    assert_response :ok
    response.parsed_body
  end

  # add_to_shopping_list

  test "a standard item that is not on the list becomes a new line ×1" do
    assert_difference("ShoppingListItem.count", 1) do
      lines = add_standard(standard_items(:kaas))

      assert_equal 1, lines.size
      assert_equal({ "name" => "kaas", "quantity" => nil, "unit" => nil, "source_label" => "standaard",
        "recipe_id" => nil, "checked" => false, "standard_count" => 1 },
        lines.first.except("id", "ingredient_id"))
    end
  end

  test "tapping again adds one to the same line instead of a new line" do
    first = add_standard(standard_items(:kaas)).first

    assert_no_difference("ShoppingListItem.count") do
      second = add_standard(standard_items(:kaas)).first
      assert_equal first["id"], second["id"]
      assert_equal 2, second["standard_count"]
    end
  end

  test "a recipe line already on the list gets +1 and keeps its quantity" do
    line = ShoppingListItem.create!(name: "melk", quantity: 200, unit: "ml",
      source_label: "Pannenkoeken", recipe: recipes(:pannenkoeken))

    assert_no_difference("ShoppingListItem.count") do
      result = add_standard(standard_items(:melk)).first
      assert_equal({ "id" => line.id, "quantity" => 200, "unit" => "ml", "source_label" => "Pannenkoeken",
        "standard_count" => 1 }, result.slice("id", "quantity", "unit", "source_label", "standard_count"))
    end
  end

  test "a ticked off line does not count: tapping makes a new line" do
    # The melk fixture is a standard line that is ticked off.
    assert_difference("ShoppingListItem.count", 1) do
      assert_not_equal shopping_list_items(:melk).id, add_standard(standard_items(:melk)).first["id"]
    end
    assert_equal 1, shopping_list_items(:melk).reload.standard_count
  end

  test "selection mode: items on the list get +1, the others a new line" do
    kaas = ShoppingListItem.create!(name: "kaas", source_label: "standaard")

    assert_difference("ShoppingListItem.count", 2) do
      lines = add_standard(standard_items(:kaas), standard_items(:melk), standard_items(:wc_papier))
      assert_equal [ [ "kaas", 2 ], [ "melk", 1 ], [ "wc-papier", 1 ] ],
        lines.map { |line| [ line["name"], line["standard_count"] ] }
      assert_equal kaas.id, lines.first["id"]
    end
  end

  test "unknown ids are skipped, and no ids is a 400" do
    post add_to_shopping_list_api_standard_items_url, params: { ids: [ 0 ] }, as: :json
    assert_response :ok
    assert_equal [], response.parsed_body

    post add_to_shopping_list_api_standard_items_url, params: {}, as: :json
    assert_response :bad_request
  end

  test "add_to_shopping_list counts towards the shared public limit" do
    PublicWriteRateLimit::WRITES_PER_MINUTE.times do
      post add_to_shopping_list_api_standard_items_url, params: { ids: [ 0 ] }, as: :json
    end
    assert_response :ok

    post add_to_shopping_list_api_standard_items_url, params: { ids: [ 0 ] }, as: :json
    assert_response :too_many_requests
  end

  # remove_standard

  test "the minus button counts down, and a standard line at 0 is removed" do
    line = ShoppingListItem.create!(name: "kaas", source_label: "standaard", standard_count: 2)

    post remove_standard_api_shopping_list_item_url(line), as: :json
    assert_response :ok
    assert_equal 1, response.parsed_body["item"]["standard_count"]

    assert_difference("ShoppingListItem.count", -1) do
      post remove_standard_api_shopping_list_item_url(line), as: :json
    end
    assert_response :ok
    assert_nil response.parsed_body["item"]
  end

  test "the minus button on a recipe line at 0 leaves the recipe part" do
    line = shopping_list_items(:bloem)
    line.update!(standard_count: 1)

    assert_no_difference("ShoppingListItem.count") do
      post remove_standard_api_shopping_list_item_url(line), as: :json
    end
    assert_equal({ "quantity" => 250, "source_label" => "Pannenkoeken", "standard_count" => 0 },
      response.parsed_body["item"].slice("quantity", "source_label", "standard_count"))
  end

  test "the minus button on a line that is gone is a 404" do
    post remove_standard_api_shopping_list_item_url(id: 0), as: :json
    assert_response :not_found
  end

  # remove_recipe

  test "removing the recipe part of a line without standard part removes the line" do
    assert_difference("ShoppingListItem.count", -1) do
      post remove_recipe_api_shopping_list_item_url(shopping_list_items(:bloem)), as: :json
    end
    assert_response :ok
    assert_nil response.parsed_body["item"]
  end

  test "removing the recipe part of a line with standard part leaves a standard line" do
    line = shopping_list_items(:bloem)
    line.update!(standard_count: 1)

    assert_no_difference("ShoppingListItem.count") do
      post remove_recipe_api_shopping_list_item_url(line), as: :json
    end
    assert_response :ok
    assert_equal({ "id" => line.id, "name" => "bloem", "quantity" => nil, "unit" => nil, "source_label" => "standaard",
      "recipe_id" => nil, "standard_count" => 1 },
      response.parsed_body["item"].except("ingredient_id", "checked"))
  end
end
