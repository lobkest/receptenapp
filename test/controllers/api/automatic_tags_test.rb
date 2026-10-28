require "test_helper"

# Automatic tags through the API: in the recipe JSON, in the filter, refused by hand, and
# the traits of an ingredient (PATCH /api/ingredients/1/traits, GET /api/traits).
class Api::AutomaticTagsTest < ActionDispatch::IntegrationTest
  AUTOMATIC = "bevat \"vegetarisch\", maar die tag volgt automatisch uit de ingrediënten"

  setup do
    Rails.cache.clear # reset rate_limit counters
    @kip = Ingredient.create!(name: "kip", trait_names: %w[ vlees dierlijk ])
    @wok = create_recipe("Wok", { ingredient_name: "kip", alternatives_attributes: [ { ingredient_name: "tofu" } ] },
      { ingredient_name: "rijst" })
    @stoof = create_recipe("Stoof", { ingredient_name: "kip" })
    @salade = create_recipe("Salade", { ingredient_name: "rijst" }, { ingredient_name: "kip", optional: true })
  end

  # ---------- In the JSON ----------

  test "the recipe has its automatic tags with status and hints, apart from the tags by hand" do
    get api_recipe_url(@wok), as: :json

    body = response.parsed_body
    assert_equal [], body["tags"]
    vegetarisch = body["automatic_tags"].find { |tag| tag["name"] == "vegetarisch" }
    row = @wok.recipe_ingredients.first
    assert_equal({ "name" => "vegetarisch", "status" => "met_wissel", "disclaimer" => false,
      "swaps" => [ { "recipe_ingredient_id" => row.id, "ingredient" => "kip",
                     "alternatives" => [ { "id" => row.alternatives.first.id, "name" => "tofu" } ] } ],
      "without" => [] }, vegetarisch)
    assert_equal %w[ glutenvrij lactosevrij notenvrij veganistisch vegetarisch ], body["automatic_tags"].pluck("name")
    assert body["automatic_tags"].find { |tag| tag["name"] == "glutenvrij" }["disclaimer"]
  end

  test "an optional ingredient that does not fit gives zonder" do
    get api_recipes_url, as: :json

    salade = response.parsed_body.find { |recipe| recipe["id"] == @salade.id }
    vegetarisch = salade["automatic_tags"].find { |tag| tag["name"] == "vegetarisch" }
    assert_equal [ "ja", [ "kip" ] ], [ vegetarisch["status"], vegetarisch["without"].pluck("ingredient") ]
  end

  # ---------- Filter ----------

  test "the filter on an automatic tag lets ja and met_wissel through, not nee" do
    get api_recipes_url(tags: "vegetarisch"), as: :json

    titles = response.parsed_body.pluck("title")
    assert_includes titles, "Wok", "met_wissel"
    assert_includes titles, "Salade", "ja, without the optional kip"
    assert_includes titles, "Pannenkoeken"
    assert_not_includes titles, "Stoof"
    assert_not_includes titles, "Stamppot", "no ingredients: no automatic tags"
  end

  test "an automatic and a manual tag together: both must fit" do
    @wok.update!(tag_names: [ "snel" ])

    get api_recipes_url(tags: "snel,Vegetarisch"), as: :json
    assert_equal [ "Wok" ], response.parsed_body.pluck("title")

    get api_recipes_url(tags: "snel,veganistisch,lactosevrij"), as: :json
    assert_equal [ "Wok" ], response.parsed_body.pluck("title")

    get api_recipes_url(tags: "vega,veganistisch"), as: :json
    assert_equal [], response.parsed_body, "pannenkoeken has vega, but egg and milk"
  end

  # ---------- Not by hand ----------

  test "an automatic tag cannot be set by hand when submitting or editing" do
    assert_no_difference("Recipe.count") do
      post api_recipes_url, as: :json, params: { recipe: {
        title: "Linzensoep", servings: 2, tag_names: [ "Vegetarisch", "soep" ],
        recipe_ingredients_attributes: [ { ingredient_name: "linzen" } ], steps_attributes: [ { body: "Koken." } ]
      } }
    end
    assert_response :unprocessable_content
    assert_equal [ AUTOMATIC ], response.parsed_body["errors"]["tag_names"]

    patch api_recipe_url(@wok), as: :json, params: { recipe: { lock_version: @wok.lock_version, tag_names: [ "vegetarisch" ] } }
    assert_response :unprocessable_content
    assert_equal [ AUTOMATIC ], response.parsed_body["errors"]["tag_names"]
    assert_empty @wok.reload.tags
  end

  test "an automatic tag cannot be added or taken off by hand in a variation" do
    post api_recipe_variations_url(@wok), as: :json, params: { variation: {
      name: "Vega", added_tag_names: [ "vegetarisch" ], removed_tag_names: [ "glutenvrij" ]
    } }

    assert_response :unprocessable_content
    assert_equal [ AUTOMATIC ], response.parsed_body["errors"]["added_tag_names"]
    assert_equal [ "bevat \"glutenvrij\", maar die tag volgt automatisch uit de ingrediënten" ],
      response.parsed_body["errors"]["removed_tag_names"]
  end

  test "a variation shows the automatic tags it gains or loses as tag changes" do
    post api_recipe_variations_url(@stoof), as: :json, params: { variation: {
      name: "Met tofu", removed_ingredient_ids: [ @stoof.recipe_ingredients.first.id ], added_ingredients: [ { name: "tofu" } ]
    } }

    assert_response :created
    assert_equal [ { "kind" => "add", "tag" => "veganistisch", "automatic" => true },
                   { "kind" => "add", "tag" => "vegetarisch", "automatic" => true } ], response.parsed_body["tag_changes"]
  end

  test "a new ingredient, also from submitting a recipe or a variation, is not checked yet" do
    post api_recipes_url, as: :json, params: { recipe: {
      title: "Linzensoep", servings: 2, recipe_ingredients_attributes: [ { ingredient_name: "Linzen" } ],
      steps_attributes: [ { body: "Koken." } ], variations_attributes: [ { name: "Pittig", added_ingredients: [ { name: "Sambal" } ] } ]
    } }

    assert_response :created
    refute Ingredient.find_by!(name: "linzen").traits_checked
    refute Ingredient.find_by!(name: "sambal").traits_checked
  end

  # ---------- Traits of an ingredient ----------

  test "GET /api/traits lists the traits in order, with the tags each one rules out" do
    get api_traits_url, as: :json

    assert_equal %w[ vlees vis dierlijk gluten lactose noten ], response.parsed_body.pluck("name")
    assert_equal [ "vegetarisch" ], response.parsed_body.first["excluded_by"]
    assert_equal [ "veganistisch" ], response.parsed_body.find { |trait| trait["name"] == "dierlijk" }["excluded_by"]
  end

  test "changing a trait changes the label on the recipe, without touching lock_version or needs_review" do
    @kip.update!(needs_review: true)
    lock_version = @kip.reload.lock_version

    patch traits_api_ingredient_url(@kip), as: :json, params: { ingredient: { trait_names: [ "Dierlijk" ] } }

    assert_response :ok
    assert_equal [ [ "dierlijk" ], false ], response.parsed_body.values_at("traits", "traits_checked")
    assert_equal [ lock_version, true ], @kip.reload.values_at(:lock_version, :needs_review)
    get api_recipe_url(@stoof), as: :json
    assert_equal "ja", response.parsed_body["automatic_tags"].find { |tag| tag["name"] == "vegetarisch" }["status"]

    patch traits_api_ingredient_url(@kip), as: :json, params: { ingredient: { trait_names: [] } }
    assert_empty @kip.reload.traits
  end

  test "Gecontroleerd sets traits_checked and leaves the traits alone" do
    patch traits_api_ingredient_url(@kip), as: :json, params: { ingredient: { traits_checked: true } }

    assert_response :ok
    assert_equal [ %w[ vlees dierlijk ], true ], response.parsed_body.values_at("traits", "traits_checked")
    assert @kip.reload.traits_checked
  end

  test "an unknown trait gives 422 and changes nothing" do
    patch traits_api_ingredient_url(@kip), as: :json, params: { ingredient: { trait_names: [ "vlees", "pittig" ] } }

    assert_response :unprocessable_content
    assert response.parsed_body["errors"].key?("trait_names")
    assert_equal %w[ dierlijk vlees ], @kip.reload.traits.map(&:name).sort
  end

  test "the ingredients list has traits and traits_checked" do
    get api_ingredients_url, as: :json

    kip = response.parsed_body.find { |row| row["name"] == "kip" }
    assert_equal [ %w[ vlees dierlijk ], false ], kip.values_at("traits", "traits_checked")
  end

  private
    def create_recipe(title, *rows)
      Recipe.create!(title: title, servings: 2, steps_attributes: [ { body: "Koken." } ], recipe_ingredients_attributes: rows)
    end
end
