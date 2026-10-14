require "test_helper"

# "Alles op lijst" and "+ lijst" on the recipe page: the browser only says which recipe,
# how many servings and (for one ingredient) which row. The server scales with Quantity,
# the same as for "Variatie op lijst", and stores one line per ingredient.
class Api::RecipeShoppingListTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear # reset rate_limit counters
    @recipe = recipes(:pannenkoeken) # for 4: 250 g bloem, 500 ml melk, 2 stuks ei, zout (optional, naar smaak)
  end

  test "Alles op lijst: every ingredient except the optional ones, scaled, with the recipe as source" do
    assert_difference("ShoppingListItem.count", 3) do
      post add_to_shopping_list_api_recipe_url(@recipe), as: :json, params: { servings: 6 }
    end

    assert_response :created
    # In the order of the recipe page (by row id); fixture ids are not in file order.
    assert_equal [ [ "bloem", 375, "g" ], [ "ei", 3, "stuks" ], [ "melk", 750, "ml" ] ],
      response.parsed_body.map { |item| item.values_at("name", "quantity", "unit") }.sort
    assert_equal [ "Pannenkoeken" ], response.parsed_body.pluck("source_label").uniq
    assert_equal [ @recipe.id ], response.parsed_body.pluck("recipe_id").uniq
  end

  test "+ lijst: only the chosen ingredient, also an optional one" do
    ei = recipe_ingredients(:pannenkoeken_ei)
    zout = recipe_ingredients(:pannenkoeken_zout)

    post add_to_shopping_list_api_recipe_url(@recipe), as: :json, params: { servings: 1, ingredient_ids: [ ei.id ] }
    assert_equal [ [ "ei", BigDecimal("0.5"), "stuks" ] ],
      ShoppingListItem.where(id: response.parsed_body.pluck("id")).pluck(:name, :quantity, :unit)

    post add_to_shopping_list_api_recipe_url(@recipe), as: :json, params: { servings: 1, ingredient_ids: [ zout.id ] }
    assert_equal [ [ "zout", nil, nil ] ], response.parsed_body.map { |item| item.values_at("name", "quantity", "unit") }
  end

  test "without servings the recipe's own number is used" do
    post add_to_shopping_list_api_recipe_url(@recipe), as: :json

    assert_response :created
    assert_equal [ 2, 250, 500 ], response.parsed_body.pluck("quantity").sort
  end

  test "odd servings: a 422 in the shared format, with the message at the field, and nothing stored" do
    { 0 => "moet groter zijn dan 0", 51 => "moet minder dan of gelijk zijn aan 50", "veel" => "is geen getal" }.each do |servings, message|
      assert_no_difference("ShoppingListItem.count") do
        post add_to_shopping_list_api_recipe_url(@recipe), as: :json, params: { servings: servings }
      end

      assert_response :unprocessable_content
      assert_equal [ message ], response.parsed_body.dig("errors", "servings"), servings.inspect
      assert_equal "Porties #{message}", response.parsed_body["error"]
    end
  end

  test "an ingredient of another recipe is refused" do
    other = Recipe.create!(title: "Anders", servings: 2,
      recipe_ingredients_attributes: [ { ingredient_name: "kaas", quantity: 1, unit: "stuks" } ],
      steps_attributes: [ { body: "Eten." } ])

    assert_no_difference("ShoppingListItem.count") do
      post add_to_shopping_list_api_recipe_url(@recipe), as: :json,
        params: { ingredient_ids: [ other.recipe_ingredients.first.id ] }
    end

    assert_response :unprocessable_content
    assert_equal [ "bevat een ingrediënt dat niet bij dit recept hoort" ], response.parsed_body.dig("errors", "ingredient_ids")
  end

  test "a hidden recipe cannot be put on the list" do
    post add_to_shopping_list_api_recipe_url(recipes(:erwtensoep)), as: :json

    assert_response :not_found
    assert_equal({ "error" => "Recept niet gevonden.", "errors" => {} }, response.parsed_body)
  end

  test "it counts towards the public write limit" do
    PublicWriteRateLimit::WRITES_PER_MINUTE.times do
      post add_to_shopping_list_api_recipe_url(@recipe), as: :json
    end

    post add_to_shopping_list_api_recipe_url(@recipe), as: :json

    assert_response :too_many_requests
  end
end
