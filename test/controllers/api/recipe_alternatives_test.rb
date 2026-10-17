require "test_helper"

# Alternatives per ingredient row ("⇄ tofu" under "kip"): saved with the recipe form,
# sent with the recipe, and used by "op lijst" when the recipe page swapped a row.
class Api::RecipeAlternativesTest < ActionDispatch::IntegrationTest
  TEST_TOKEN = "test-admin-token"

  setup do
    @original_admin_token = ENV["ADMIN_TOKEN"]
    ENV["ADMIN_TOKEN"] = TEST_TOKEN
    Rails.cache.clear # reset rate_limit counters
    @recipe = recipes(:pannenkoeken) # for 4: 250 g bloem, 500 ml melk, 2 stuks ei, zout (optional)
    @melk = recipe_ingredients(:pannenkoeken_melk)
    @bloem = recipe_ingredients(:pannenkoeken_bloem)
    @zout = recipe_ingredients(:pannenkoeken_zout)
  end

  teardown do
    ENV["ADMIN_TOKEN"] = @original_admin_token
  end

  test "create: alternatives come along, with the effective amount in the answer" do
    post api_recipes_url, as: :json, params: { recipe: {
      title: "Wok", servings: 2, steps_attributes: [ { body: "Bakken." } ],
      recipe_ingredients_attributes: [
        { ingredient_name: "kip", quantity: "250", unit: "g", alternatives_attributes: [
          { ingredient_name: " Tofu ", quantity: "", unit: "" },
          { ingredient_name: "tempeh", quantity: "200", unit: "g" }
        ] }
      ]
    } }

    assert_response :created
    kip = response.parsed_body["ingredients"].sole
    assert_equal [
      { "name" => "tofu", "quantity" => nil, "unit" => nil, "effective_quantity" => 250, "effective_unit" => "g" },
      { "name" => "tempeh", "quantity" => 200, "unit" => "g", "effective_quantity" => 200, "effective_unit" => "g" }
    ], kip["alternatives"].map { |alternative| alternative.except("id", "ingredient_id") }
    assert Ingredient.exists?(name: "tempeh")
  end

  test "show: alternatives in order, an empty list for a row without" do
    add_alternatives(@melk, { ingredient_name: "havermelk", quantity: "0,5", unit: "stuks" }, { ingredient_name: "water" })

    get api_recipe_url(@recipe), as: :json

    rows = response.parsed_body["ingredients"].index_by { |row| row["name"] }
    assert_equal [ [ "havermelk", 0.5, "stuks", 0.5, "stuks" ], [ "water", nil, nil, 500, "ml" ] ],
      rows["melk"]["alternatives"].map { |a| a.values_at("name", "quantity", "unit", "effective_quantity", "effective_unit") }
    assert_equal [], rows["bloem"]["alternatives"]
  end

  test "show: rows and alternatives name their ingredient, for the shopping list status" do
    add_alternatives(@melk, { ingredient_name: "havermelk" })

    get api_recipe_url(@recipe), as: :json

    melk = response.parsed_body["ingredients"].find { |row| row["name"] == "melk" }
    assert_equal @melk.ingredient_id, melk["ingredient_id"]
    assert_equal Ingredient.find_by!(name: "havermelk").id, melk["alternatives"].sole["ingredient_id"]
  end

  test "show: alternatives do not cost a query per row" do
    add_alternatives(@melk, { ingredient_name: "havermelk" })
    add_alternatives(@bloem, { ingredient_name: "speltmeel" }, { ingredient_name: "boekweitmeel" })

    queries = count_queries { get api_recipe_url(@recipe), as: :json }

    # The 15 of RecipesControllerTest, plus the alternatives, their ingredients and those
    # ingredients' NEVO products (nutrition per alternative).
    assert_operator queries, :<=, 18
  end

  test "update: add, change and remove alternatives; anyone may" do
    add_alternatives(@melk, { ingredient_name: "havermelk" }, { ingredient_name: "water" })
    haver, water = @melk.reload.alternatives.to_a

    edit recipe_ingredients_attributes: [ { id: @melk.id, alternatives_attributes: [
      { id: haver.id, ingredient_name: "sojamelk", quantity: "400", unit: "ml" },
      { id: water.id, _destroy: true },
      { ingredient_name: "rijstmelk" }
    ] } ]

    assert_response :ok
    assert_equal [ [ "sojamelk", BigDecimal(400), "ml", 1 ], [ "rijstmelk", nil, nil, 2 ] ],
      @melk.reload.alternatives.map { |a| [ a.ingredient_name, a.quantity, a.unit, a.position ] }
    assert_equal haver.id, @melk.alternatives.first.id
  end

  test "update: errors name the row and the alternative" do
    add_alternatives(@melk, { ingredient_name: "havermelk" })

    edit recipe_ingredients_attributes: [
      { id: @bloem.id, ingredient_name: "bloem", alternatives_attributes: [ { ingredient_name: "Bloem" } ] },
      { id: @melk.id, ingredient_name: "melk", alternatives_attributes: [ { ingredient_name: "havermelk" }, { ingredient_name: "water", quantity: "2" } ] }
    ]

    assert_response :unprocessable_content
    errors = response.parsed_body["errors"]
    assert_equal [ "is hetzelfde als het ingrediënt zelf" ], errors["recipe_ingredients[0].alternatives[0].ingredient_name"]
    assert_equal [ "staat al als alternatief bij dit ingrediënt" ], errors["recipe_ingredients[1].alternatives[0].ingredient_name"]
    assert_equal [ "moet opgegeven zijn" ], errors["recipe_ingredients[1].alternatives[1].unit"]
  end

  test "update: an alternative of another row is not found" do
    add_alternatives(@melk, { ingredient_name: "havermelk" })

    edit recipe_ingredients_attributes: [ { id: @bloem.id, alternatives_attributes: [ { id: @melk.alternatives.sole.id, _destroy: true } ] } ]

    assert_response :not_found
    assert_equal 1, @melk.alternatives.count
  end

  test "update: renaming only an ingredient row is saved" do
    edit recipe_ingredients_attributes: [ { id: @bloem.id, ingredient_name: "speltmeel" } ]

    assert_response :ok
    assert_equal "speltmeel", @bloem.reload.ingredient_name
  end

  test "Alles op lijst with a swapped row: the alternative with the row's amount, scaled; source stays the recipe" do
    add_alternatives(@melk, { ingredient_name: "havermelk" })

    post add_to_shopping_list_api_recipe_url(@recipe), as: :json,
      params: { servings: 6, alternative_ids: [ @melk.alternatives.sole.id ] }

    assert_response :created
    assert_equal [ [ "bloem", 375, "g" ], [ "ei", 3, "stuks" ], [ "havermelk", 750, "ml" ] ],
      response.parsed_body.map { |item| item.values_at("name", "quantity", "unit") }.sort
    assert_equal [ "Pannenkoeken" ], response.parsed_body.pluck("source_label").uniq
  end

  test "Alles op lijst: a swapped optional row is still left out; + lijst puts it on as the alternative" do
    add_alternatives(@zout, { ingredient_name: "zeezout", quantity: 1, unit: "tl" })
    zeezout = @zout.alternatives.sole

    post add_to_shopping_list_api_recipe_url(@recipe), as: :json, params: { servings: 4, alternative_ids: [ zeezout.id ] }
    assert_not_includes response.parsed_body.pluck("name"), "zeezout"

    post add_to_shopping_list_api_recipe_url(@recipe), as: :json,
      params: { servings: 8, ingredient_ids: [ @zout.id ], alternative_ids: [ zeezout.id ] }
    assert_equal [ [ "zeezout", 2, "tl" ] ], response.parsed_body.map { |item| item.values_at("name", "quantity", "unit") }
  end

  test "op lijst: an unknown alternative or two for one row is refused" do
    add_alternatives(@melk, { ingredient_name: "havermelk" }, { ingredient_name: "water" })

    assert_no_difference("ShoppingListItem.count") do
      post add_to_shopping_list_api_recipe_url(@recipe), as: :json, params: { alternative_ids: [ 0 ] }
      assert_response :unprocessable_content
      assert_equal [ "bevat een alternatief dat niet bij dit recept hoort" ], response.parsed_body["errors"]["alternative_ids"]

      post add_to_shopping_list_api_recipe_url(@recipe), as: :json, params: { alternative_ids: @melk.alternatives.ids }
      assert_response :unprocessable_content
      assert_equal [ "bevat twee alternatieven voor hetzelfde ingrediënt" ], response.parsed_body["errors"]["alternative_ids"]
    end
  end

  test "Variatie op lijst with swaps: a swapped row goes on as the alternative, a removed row stays removed" do
    variation = recipe_variations(:spek) # without the milk, with 100 g spek
    add_alternatives(@melk, { ingredient_name: "havermelk" })
    add_alternatives(@bloem, { ingredient_name: "speltmeel", quantity: 200, unit: "g" })

    post add_to_shopping_list_api_recipe_variation_url(@recipe, variation), as: :json,
      params: { servings: 4, alternative_ids: [ @melk.alternatives.sole.id, @bloem.alternatives.sole.id ] }

    assert_response :created
    assert_equal [ [ "ei", 2, "stuks" ], [ "spek", 100, "g" ], [ "speltmeel", 200, "g" ] ],
      response.parsed_body.map { |item| item.values_at("name", "quantity", "unit") }.sort
  end

  test "restoring a version through the admin API brings the alternatives back" do
    add_alternatives(@melk, { ingredient_name: "havermelk" })
    version = @recipe.versions.newest_first.first
    edit recipe_ingredients_attributes: [ { id: @melk.id, _destroy: true } ]
    assert_response :ok

    post restore_api_admin_recipe_version_url(@recipe, version), as: :json, headers: { "Authorization" => "Bearer #{TEST_TOKEN}" }

    assert_response :ok
    melk = response.parsed_body["ingredients"].find { |row| row["name"] == "melk" }
    assert_equal [ "havermelk" ], melk["alternatives"].pluck("name")
  end

  private
    def add_alternatives(row, *alternatives)
      @recipe.reload.update!(recipe_ingredients_attributes: [ { id: row.id, alternatives_attributes: alternatives } ])
    end

    def edit(**attributes)
      patch api_recipe_url(@recipe), as: :json,
        params: { recipe: { lock_version: @recipe.reload.lock_version, **attributes } }
    end

    def count_queries(&block)
      count = 0
      counter = ->(*, payload) { count += 1 unless payload[:name].in?([ "SCHEMA", "TRANSACTION" ]) }
      ActiveSupport::Notifications.subscribed(counter, "sql.active_record", &block)
      count
    end
end
