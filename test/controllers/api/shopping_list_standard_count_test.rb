require "test_helper"

# The standard list on the shopping list: a tap adds one (a new line, or one more on a line
# that is already there), "✓ op lijst" on the standard list takes that part off again, and
# "✓ op lijst" on a recipe keeps what came from the standard list.
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
        "recipe_id" => nil, "checked" => false, "count" => 1, "standard_count" => 1, "recipe_title" => nil, "recipe_visible" => false,
        "category" => "zuivel" },
        lines.first.except("id", "ingredient_id"))
    end
  end

  test "tapping again adds one to the same line instead of a new line" do
    first = add_standard(standard_items(:kaas)).first

    assert_no_difference("ShoppingListItem.count") do
      second = add_standard(standard_items(:kaas)).first
      assert_equal first["id"], second["id"]
      assert_equal [ 2, 2 ], second.values_at("count", "standard_count")
    end
  end

  test "a recipe line already on the list gets one more and keeps its quantity per piece" do
    line = ShoppingListItem.create!(name: "melk", quantity: 200, unit: "ml",
      source_label: "Pannenkoeken", recipe: recipes(:pannenkoeken))

    assert_no_difference("ShoppingListItem.count") do
      result = add_standard(standard_items(:melk)).first
      assert_equal({ "id" => line.id, "quantity" => 200, "unit" => "ml", "source_label" => "Pannenkoeken",
        "count" => 2, "standard_count" => 1 }, result.slice("id", "quantity", "unit", "source_label", "count", "standard_count"))
    end
  end

  test "a ticked off line does not count: tapping makes a new line" do
    # The melk fixture is a standard line that is ticked off.
    assert_difference("ShoppingListItem.count", 1) do
      assert_not_equal shopping_list_items(:melk).id, add_standard(standard_items(:melk)).first["id"]
    end
    assert_equal 1, shopping_list_items(:melk).reload.standard_count
  end

  test "selection mode: items on the list get one more, the others a new line" do
    kaas = ShoppingListItem.create!(name: "kaas", source_label: "standaard")

    assert_difference("ShoppingListItem.count", 2) do
      lines = add_standard(standard_items(:kaas), standard_items(:melk), standard_items(:wc_papier))
      assert_equal [ [ "kaas", 2 ], [ "melk", 1 ], [ "wc-papier", 1 ] ],
        lines.map { |line| [ line["name"], line["count"] ] }
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

  # remove_from_shopping_list

  def remove_standard(*names)
    post remove_from_shopping_list_api_standard_items_url, params: { names: names }, as: :json
    assert_response :ok
    response.parsed_body
  end

  test "a line only from the standard list is removed, also with count 3" do
    line = ShoppingListItem.create!(name: "kaas", source_label: "standaard", count: 3, standard_count: 3)

    assert_difference("ShoppingListItem.count", -1) do
      assert_equal({ "removed_ids" => [ line.id ], "items" => [] }, remove_standard(" Kaas "))
    end
  end

  test "a recipe line with a standard part keeps the recipe part: standard_count 0, the taps off count" do
    line = ShoppingListItem.create!(name: "melk", quantity: 200, unit: "ml", count: 3, standard_count: 2,
      source_label: "Pannenkoeken", recipe: recipes(:pannenkoeken))

    assert_no_difference("ShoppingListItem.count") do
      result = remove_standard("melk")
      assert_equal [], result["removed_ids"]
      assert_equal({ "id" => line.id, "quantity" => 200, "unit" => "ml", "source_label" => "Pannenkoeken",
        "count" => 1, "standard_count" => 0 },
        result["items"].first.slice("id", "quantity", "unit", "source_label", "count", "standard_count"))
    end
  end

  test "lines without a standard part, and ticked off lines, stay as they are" do
    loose = ShoppingListItem.create!(name: "melk", source_label: "los", count: 2)

    assert_no_difference("ShoppingListItem.count") do
      assert_equal({ "removed_ids" => [], "items" => [] }, remove_standard("melk", "bloem"))
    end
    assert_equal 2, loose.reload.count
    assert_equal 250, shopping_list_items(:bloem).reload.quantity
    assert shopping_list_items(:melk).reload.checked # the ticked off standard line
  end

  test "removing matches the linked ingredient too, like adding" do
    standard_items(:kaas).link_to!(ingredients(:bloem))

    remove_standard("kaas")
    assert ShoppingListItem.exists?(shopping_list_items(:bloem).id)

    shopping_list_items(:bloem).update!(count: 2, standard_count: 1)
    assert_equal [ 1, 0 ], remove_standard("kaas")["items"].first.values_at("count", "standard_count")
  end

  test "remove_from_shopping_list counts towards the shared public limit" do
    PublicWriteRateLimit::WRITES_PER_MINUTE.times { remove_standard("kaas") }

    post remove_from_shopping_list_api_standard_items_url, params: { names: [ "kaas" ] }, as: :json
    assert_response :too_many_requests
  end

  test "no names is a 400" do
    post remove_from_shopping_list_api_standard_items_url, params: {}, as: :json
    assert_response :bad_request
  end

  # remove_recipe

  test "removing the recipe part of a line without standard part removes the line" do
    assert_difference("ShoppingListItem.count", -1) do
      post remove_recipe_api_shopping_list_item_url(shopping_list_items(:bloem)), as: :json
    end
    assert_response :ok
    assert_nil response.parsed_body["item"]
  end

  test "removing the recipe part of a line with standard part leaves a standard line, one less" do
    line = shopping_list_items(:bloem)
    line.update!(count: 2, standard_count: 1)

    assert_no_difference("ShoppingListItem.count") do
      post remove_recipe_api_shopping_list_item_url(line), as: :json
    end
    assert_response :ok
    assert_equal({ "id" => line.id, "name" => "bloem", "quantity" => nil, "unit" => nil, "source_label" => "standaard",
      "recipe_id" => nil, "count" => 1, "standard_count" => 1 },
      response.parsed_body["item"].except("ingredient_id", "checked", "recipe_title", "recipe_visible", "category"))
  end
end
