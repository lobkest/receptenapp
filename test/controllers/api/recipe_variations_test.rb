require "test_helper"

# Variations through the public API: in the recipe detail, create, update (lock_version),
# request_deletion and "Variatie op lijst".
class Api::RecipeVariationsTest < ActionDispatch::IntegrationTest
  CONFLICT = "Deze variatie is intussen door iemand anders gewijzigd. Herlaad en probeer opnieuw."

  setup do
    Rails.cache.clear # reset rate_limit counters
    @recipe = recipes(:pannenkoeken)
    @spek = recipe_variations(:spek)
    @bloem = recipe_ingredients(:pannenkoeken_bloem)
    @melk = recipe_ingredients(:pannenkoeken_melk)
  end

  # ---------- In the recipe detail ----------

  test "the recipe detail has the visible variations with their changes and tag changes" do
    get api_recipe_url(@recipe), as: :json

    assert_response :ok
    variations = response.parsed_body["variations"]
    assert_equal [ "Met spek" ], variations.pluck("name") # Glutenvrij has a deletion request
    assert_equal({
      "id" => @spek.id, "name" => "Met spek", "notes" => "Spek eerst uitbakken.", "position" => 1, "lock_version" => 0,
      "changes" => [
        { "id" => variation_changes(:spek_zonder_melk).id, "kind" => "remove", "recipe_ingredient_id" => @melk.id,
          "name" => "melk", "quantity" => nil, "unit" => nil },
        { "id" => variation_changes(:spek_met_spek).id, "kind" => "add", "recipe_ingredient_id" => nil,
          "name" => "spek", "quantity" => 100, "unit" => "g" }
      ],
      "tag_changes" => [ { "kind" => "remove", "tag" => "vega" } ]
    }, variations.first)
  end

  test "the recipe detail needs no extra queries for more variations" do
    one = count_queries { get api_recipe_url(@recipe), as: :json }

    3.times do |index|
      @recipe.variations.create!(name: "Variatie #{index}", removed_ingredient_ids: [ @bloem.id ],
        added_ingredients: [ { name: "kip", quantity: 1, unit: "stuks" } ], added_tag_names: [ "hartig#{index}" ],
        removed_tag_names: [ "zoet" ])
    end
    four = count_queries { get api_recipe_url(@recipe), as: :json }

    assert_equal 4, response.parsed_body["variations"].size
    assert_equal one, four
  end

  # ---------- Create ----------

  test "anyone can add a variation, without a code" do
    assert_difference("RecipeVariation.count", 1) do
      post api_recipe_variations_url(@recipe), as: :json, params: { variation: {
        name: "Met kip", notes: "Kip eerst bakken.", removed_ingredient_ids: [ @bloem.id ],
        added_ingredients: [ { name: "kip", quantity: "1,5", unit: "stuks" } ],
        added_tag_names: [ "Vlees" ], removed_tag_names: [ "vega" ]
      } }
    end

    assert_response :created
    body = response.parsed_body
    assert_equal [ "Met kip", "Kip eerst bakken.", 3 ], body.values_at("name", "notes", "position")
    assert_equal [ [ "remove", "bloem", nil ], [ "add", "kip", 1.5 ] ], body["changes"].map { |c| c.values_at("kind", "name", "quantity") }
    assert_equal [ { "kind" => "add", "tag" => "vlees" }, { "kind" => "remove", "tag" => "vega" } ], body["tag_changes"]
  end

  test "invalid fields give 422 with errors per field and per added ingredient" do
    post api_recipe_variations_url(@recipe), as: :json, params: { variation: {
      name: "", added_ingredients: [ { name: "kip", quantity: "abc", unit: "g" } ], added_tag_names: [ "vega" ]
    } }

    assert_response :unprocessable_content
    errors = response.parsed_body["errors"]
    assert_equal [ "moet opgegeven zijn" ], errors["name"]
    assert_equal [ "is geen getal" ], errors["additions[0].quantity"]
    assert_equal [ "bevat \"vega\", maar die tag heeft het recept al" ], errors["added_tag_names"]
  end

  test "a row of another recipe cannot be removed through the API" do
    post api_recipe_variations_url(recipes(:stamppot)), as: :json,
      params: { variation: { name: "Zonder bloem", removed_ingredient_ids: [ @bloem.id ] } }

    assert_response :unprocessable_content
    assert_equal [ "hoort niet bij dit recept" ], response.parsed_body["errors"]["removals.recipe_ingredient"]
  end

  test "the eleventh variation is refused" do
    8.times { |index| @recipe.variations.create!(name: "Variatie #{index}") } # plus spek and glutenvrij

    post api_recipe_variations_url(@recipe), as: :json, params: { variation: { name: "Nog een" } }

    assert_response :unprocessable_content
    assert_equal [ "Dit recept heeft al 10 variaties, het maximum" ], response.parsed_body["errors"]["base"]
  end

  test "no variations on a hidden recipe" do
    post api_recipe_variations_url(recipes(:erwtensoep)), as: :json, params: { variation: { name: "Met worst" } }

    assert_response :not_found
    assert_equal "Recept niet gevonden.", response.parsed_body["error"]
  end

  test "a variation can come with a new recipe" do
    post api_recipes_url, as: :json, params: { recipe: {
      title: "Curry", tag_names: [ "vega" ],
      recipe_ingredients_attributes: [ { ingredient_name: "tofu", quantity: 200, unit: "g" } ],
      steps_attributes: [ { body: "Koken." } ],
      variations_attributes: [ { name: "Met kip", added_ingredients: [ { name: "kip", quantity: 150, unit: "g" } ],
        removed_tag_names: [ "vega" ] } ]
    } }

    assert_response :created
    variation = response.parsed_body["variations"].sole
    assert_equal [ "Met kip", [ "kip" ], [ "vega" ] ],
      [ variation["name"], variation["changes"].pluck("name"), variation["tag_changes"].pluck("tag") ]
  end

  # ---------- Update ----------

  test "anyone can edit a variation with its lock_version; lists not sent stay as they are" do
    patch api_recipe_variation_url(@recipe, @spek), as: :json,
      params: { variation: { lock_version: 0, name: "Met veel spek", removed_ingredient_ids: [ @melk.id, @bloem.id ] } }

    assert_response :ok
    assert_equal [ "Met veel spek", 1 ], response.parsed_body.values_at("name", "lock_version")
    assert_equal [ "melk", "bloem", "spek" ], response.parsed_body["changes"].pluck("name")
    assert_equal [ "vega" ], response.parsed_body["tag_changes"].pluck("tag")
  end

  test "empty lists empty the variation" do
    patch api_recipe_variation_url(@recipe, @spek), as: :json, params: { variation: {
      lock_version: 0, removed_ingredient_ids: [], added_ingredients: [], removed_tag_names: [], added_tag_names: []
    } }

    assert_response :ok
    assert_empty response.parsed_body["changes"]
    assert_empty response.parsed_body["tag_changes"]
  end

  test "the second of two editors with the same lock_version gets a 409 and changes nothing" do
    patch api_recipe_variation_url(@recipe, @spek), as: :json, params: { variation: { lock_version: 0, name: "Eerste" } }
    assert_response :ok

    patch api_recipe_variation_url(@recipe, @spek), as: :json,
      params: { variation: { lock_version: 0, added_ingredients: [ { name: "kaas", quantity: 50, unit: "g" } ] } }
    assert_response :conflict
    assert_equal CONFLICT, response.parsed_body["error"]
    assert_equal [ "spek" ], @spek.reload.additions.map(&:name)
  end

  test "lock_version is required" do
    patch api_recipe_variation_url(@recipe, @spek), as: :json, params: { variation: { name: "Anders" } }

    assert_response :bad_request
    assert_equal "Met spek", @spek.reload.name
  end

  test "editing the recipe in the form keeps the variation's removals" do
    patch api_recipe_url(@recipe), as: :json, params: { recipe: { lock_version: @recipe.lock_version,
      recipe_ingredients_attributes: @recipe.recipe_ingredients.map { |row|
        { id: row.id, ingredient_name: row.ingredient_name, quantity: row == @bloem ? 300 : row.quantity, unit: row.unit }
      } } }
    assert_response :ok

    get api_recipe_url(@recipe), as: :json
    assert_equal [ "melk", "spek" ], response.parsed_body["variations"].first["changes"].pluck("name")
    assert_equal @melk.id, response.parsed_body["variations"].first["changes"].first["recipe_ingredient_id"]
  end

  # ---------- Deletion request ----------

  test "a deletion request hides the variation at once" do
    post request_deletion_api_recipe_variation_url(@recipe, @spek), as: :json, params: { reason: " dubbel " }

    assert_response :no_content
    assert_equal "dubbel", @spek.reload.deletion_reason

    get api_recipe_url(@recipe), as: :json
    assert_empty response.parsed_body["variations"]

    patch api_recipe_variation_url(@recipe, @spek), as: :json, params: { variation: { lock_version: 1, name: "Anders" } }
    assert_response :not_found
    assert_equal "Variatie niet gevonden.", response.parsed_body["error"]
  end

  # ---------- Variatie op lijst ----------

  test "Variatie op lijst puts the variation on the shopping list, scaled and without optional ones" do
    assert_difference("ShoppingListItem.count", 3) do
      post add_to_shopping_list_api_recipe_variation_url(@recipe, @spek), as: :json, params: { servings: 2 }
    end

    assert_response :created
    # Pannenkoeken is for 4: × 0,5. Without melk (removed) and zout (optional), with spek.
    assert_equal [ [ "bloem", 125, "g" ], [ "ei", 1, "stuks" ], [ "spek", 50, "g" ] ],
      response.parsed_body.map { |item| item.values_at("name", "quantity", "unit") }
    assert_equal [ "Pannenkoeken (variatie: Met spek)" ], response.parsed_body.pluck("source_label").uniq
    assert_equal [ @recipe.id ], response.parsed_body.pluck("recipe_id").uniq
  end

  test "Variatie op lijst uses the recipe's servings by default and refuses odd servings" do
    post add_to_shopping_list_api_recipe_variation_url(@recipe, @spek), as: :json

    assert_response :created
    assert_equal 250, response.parsed_body.first["quantity"]

    [ 0, 51, "veel" ].each do |servings|
      assert_no_difference("ShoppingListItem.count") do
        post add_to_shopping_list_api_recipe_variation_url(@recipe, @spek), as: :json, params: { servings: servings }
      end
      assert_response :unprocessable_content
    end
  end

  test "a hidden variation cannot be put on the list" do
    post add_to_shopping_list_api_recipe_variation_url(@recipe, recipe_variations(:glutenvrij)), as: :json

    assert_response :not_found
  end

  private
    def count_queries(&block)
      count = 0
      counter = ->(*, payload) { count += 1 unless payload[:name].in?([ "SCHEMA", "TRANSACTION" ]) }
      ActiveSupport::Notifications.subscribed(counter, "sql.active_record", &block)
      count
    end
end
