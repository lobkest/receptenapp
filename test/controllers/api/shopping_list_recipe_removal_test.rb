require "test_helper"

# "Recepten op je lijst" on the shopping list: "Verwijder" takes every open line of one recipe
# off in one request. Lines also added from the standard list stay as standard lines.
class Api::ShoppingListRecipeRemovalTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear # reset rate_limit counters
    @pannenkoeken = recipes(:pannenkoeken)
    @erwtensoep = recipes(:erwtensoep)
  end

  def add_line(name, recipe, **fields)
    ShoppingListItem.create!(name: name, recipe: recipe, source_label: recipe&.title, **fields)
  end

  def remove_recipe(**params)
    delete api_shopping_list_items_url(params), as: :json
    response.parsed_body
  end

  test "removes only the open lines of that recipe" do
    checked = add_line("eieren", @pannenkoeken, checked: true)
    soup = add_line("erwten", @erwtensoep)
    standard = ShoppingListItem.add_standard!("kaas")
    own_ids = [ shopping_list_items(:bloem).id, shopping_list_items(:zout).id ].sort

    assert_difference("ShoppingListItem.count", -2) do
      body = remove_recipe(recipe_id: @pannenkoeken.id)

      assert_response :ok
      assert_equal own_ids, body["removed_ids"]
      assert_equal [], body["items"]
    end
    assert ShoppingListItem.exists?(checked.id), "a ticked-off line stays"
    assert ShoppingListItem.exists?(soup.id), "another recipe stays"
    assert ShoppingListItem.exists?(standard.id), "a standard line stays"
  end

  test "a line also added from the standard list stays as a standard line" do
    melk = add_line("melk", @pannenkoeken, quantity: 200, unit: "ml")
    ShoppingListItem.add_standard!("melk")
    own_ids = [ shopping_list_items(:bloem).id, shopping_list_items(:zout).id ].sort

    body = remove_recipe(recipe_id: @pannenkoeken.id)

    assert_response :ok
    assert_equal own_ids, body["removed_ids"]
    assert_equal [ { "id" => melk.id, "name" => "melk", "quantity" => nil, "unit" => nil, "source_label" => "standaard",
      "recipe_id" => nil, "recipe_title" => nil, "standard_count" => 1 } ],
      body["items"].map { |item| item.slice("id", "name", "quantity", "unit", "source_label", "recipe_id", "recipe_title", "standard_count") }
    assert_equal [ nil, nil, "standaard", 1 ], melk.reload.values_at(:recipe_id, :quantity, :source_label, :standard_count)
  end

  test "variation lines belong to the recipe" do
    variation = add_line("spek", @pannenkoeken, source_label: "Pannenkoeken (variatie: hartig)")

    remove_recipe(recipe_id: @pannenkoeken.id)

    assert_not ShoppingListItem.exists?(variation.id)
  end

  test "a deleted recipe is found by its source_label" do
    gone = add_line("prei", nil, source_label: "Oude soep")
    other = add_line("ui", nil, source_label: "Andere soep")
    standard = ShoppingListItem.add_standard!("kaas")

    body = remove_recipe(source_label: " Oude soep ")

    assert_response :ok
    assert_equal [ gone.id ], body["removed_ids"]
    assert ShoppingListItem.exists?(other.id)
    assert ShoppingListItem.exists?(standard.id)
  end

  test "the standard list itself cannot be removed as a recipe" do
    standard = ShoppingListItem.add_standard!("kaas")

    assert_equal [], remove_recipe(source_label: "standaard")["removed_ids"]
    assert ShoppingListItem.exists?(standard.id)
  end

  test "all or nothing: one line that cannot be changed keeps every line" do
    melk = add_line("melk", @pannenkoeken, standard_count: 1)
    # Too long for the validation, so turning it into a standard line fails after bloem
    # and zout (lower ids) were already removed in the same transaction.
    melk.update_column(:name, "m" * (ShoppingListItem::MAX_LENGTH + 1))

    assert_no_difference("ShoppingListItem.count") do
      remove_recipe(recipe_id: @pannenkoeken.id)
    end
    assert_response :unprocessable_content
    assert_equal @pannenkoeken.id, melk.reload.recipe_id
  end

  test "nothing of the recipe on the list is fine" do
    assert_no_difference("ShoppingListItem.count") do
      assert_equal({ "removed_ids" => [], "items" => [] }, remove_recipe(recipe_id: @erwtensoep.id))
    end
  end

  test "without recipe_id or source_label it is a 400" do
    assert_no_difference("ShoppingListItem.count") do
      delete api_shopping_list_items_url, as: :json
    end
    assert_response :bad_request
  end

  test "the list sends the recipe name and whether it is visible, without a query per line" do
    add_line("erwten", @erwtensoep)
    add_line("spliterwten", @erwtensoep)
    @erwtensoep.request_deletion!

    queries = []
    callback = ->(*, payload) { queries << payload[:sql] if payload[:sql].include?('FROM "recipes"') }
    ActiveSupport::Notifications.subscribed(callback, "sql.active_record") do
      get api_shopping_list_items_url, as: :json
    end

    assert_equal 1, queries.size
    by_name = response.parsed_body.index_by { |item| item["name"] }
    assert_equal [ "Pannenkoeken", true ], by_name["bloem"].values_at("recipe_title", "recipe_visible")
    assert_equal [ @erwtensoep.title, false ], by_name["erwten"].values_at("recipe_title", "recipe_visible")
    assert_equal [ nil, false ], by_name["melk"].values_at("recipe_title", "recipe_visible")
  end
end
