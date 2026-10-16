require "test_helper"

# PATCH /api/recipes/:id: anyone may edit, with optimistic locking (lock_version).
class Api::RecipesUpdateTest < ActionDispatch::IntegrationTest
  CONFLICT = "Dit recept is intussen door iemand anders gewijzigd. Herlaad en probeer opnieuw."

  setup do
    Rails.cache.clear # reset rate_limit counters
    @recipe = recipes(:pannenkoeken)
    @older = recipes(:stamppot) # from before ingredients and steps
  end

  test "anyone can edit a recipe, without a code" do
    edit @recipe, title: "Flensjes"

    assert_response :ok
    assert_equal "Flensjes", @recipe.reload.title
    assert_equal "Flensjes", response.parsed_body["title"]
    assert_equal 1, response.parsed_body["lock_version"]
  end

  test "lock_version is required" do
    patch api_recipe_url(@recipe), params: { recipe: { title: "Flensjes" } }, as: :json

    assert_response :bad_request
    assert_equal "Pannenkoeken", @recipe.reload.title
  end

  test "the second of two editors with the same lock_version gets a 409 and changes nothing" do
    version = @recipe.lock_version

    edit @recipe, title: "Eerste", lock_version: version
    assert_response :ok

    edit @recipe, title: "Tweede", lock_version: version
    assert_response :conflict
    assert_equal CONFLICT, response.parsed_body["error"]
    assert_equal "Eerste", @recipe.reload.title
  end

  test "a conflict is also noticed when both only change an ingredient or a step" do
    version = @recipe.lock_version
    bloem = recipe_ingredients(:pannenkoeken_bloem)
    beslag = steps(:pannenkoeken_beslag)

    edit @recipe, lock_version: version,
      recipe_ingredients_attributes: [ { id: bloem.id, ingredient_name: "bloem", quantity: 300, unit: "g" } ]
    assert_response :ok

    edit @recipe, lock_version: version, steps_attributes: [ { id: beslag.id, body: "Anders." } ]
    assert_response :conflict
    assert_not_equal "Anders.", beslag.reload.body
  end

  test "a recipe with a deletion request cannot be edited" do
    edit recipes(:erwtensoep), title: "Snert"

    assert_response :not_found
  end

  test "update with invalid data returns 422" do
    edit @recipe, servings: 0

    assert_response :unprocessable_content
    assert response.parsed_body["errors"].key?("servings")
  end

  test "update of an older recipe without ingredients or steps stays possible" do
    edit @older, description: "Met boerenkool"

    assert_response :ok
    assert_equal "Met boerenkool", @older.reload.description
  end

  test "update can add ingredients and steps to an older recipe" do
    edit @older,
      recipe_ingredients_attributes: [ { ingredient_name: "boerenkool", quantity: 500, unit: "g" } ],
      steps_attributes: [ { body: "Koken." }, { body: "Stampen." } ]

    assert_response :ok
    assert_equal [ "Koken.", "Stampen." ], response.parsed_body["steps"].map { |s| s["body"] }
  end

  # The body the form sends: kept rows in form order, new rows without id, removed rows
  # as _destroy at the end.
  test "update saves reordered, edited, added and removed rows in one request" do
    beslag, melk, bakken = @recipe.steps.to_a
    bloem, ei, zout = recipe_ingredients(:pannenkoeken_bloem), recipe_ingredients(:pannenkoeken_ei), recipe_ingredients(:pannenkoeken_zout)

    assert_no_difference("Step.count") do
      edit @recipe, title: @recipe.title, description: @recipe.description, servings: @recipe.servings,
        steps_attributes: [
          { id: bakken.id, body: "Bak in boter." },
          { body: "Laat het beslag rusten." },
          { id: beslag.id, body: beslag.body },
          { id: melk.id, _destroy: true }
        ],
        recipe_ingredients_attributes: [
          { id: bloem.id, ingredient_name: "bloem", quantity: "300", unit: "g", optional: true },
          { id: ei.id, ingredient_name: "ei", quantity: 2, unit: "stuks" },
          { ingredient_name: "suiker", quantity: "12,5", unit: "g" },
          { id: zout.id, _destroy: true }
        ]
    end

    assert_response :ok
    expected_steps = [ [ 1, "Bak in boter." ], [ 2, "Laat het beslag rusten." ], [ 3, beslag.body ] ]
    assert_equal expected_steps, response.parsed_body["steps"].map { |s| [ s["position"], s["body"] ] }
    assert_equal expected_steps, @recipe.reload.steps.map { |s| [ s.position, s.body ] }
    assert_equal bakken.id, @recipe.steps.first.id
    assert_not Step.exists?(melk.id)

    # Ingredients have no position (sorted by id, and fixture ids are hashes), so compare without order.
    assert_equal({ "bloem" => 300, "melk" => 500, "ei" => 2, "suiker" => 12.5 },
      @recipe.recipe_ingredients.to_h { |row| [ row.ingredient_name, row.quantity ] })
    assert bloem.reload.optional
    assert_not RecipeIngredient.exists?(zout.id)
  end

  test "update replaces the tags with tag_names, and keeps them without it" do
    edit @recipe, tag_names: [ "zoet", "Ontbijt" ]
    assert_equal %w[ ontbijt zoet ], response.parsed_body["tags"]

    edit @recipe.reload, title: "Flensjes"
    assert_equal %w[ ontbijt zoet ], @recipe.reload.tags.map(&:name).sort

    edit @recipe, tag_names: []
    assert_response :ok
    assert_equal [], response.parsed_body["tags"]
  end

  test "update sets, changes and clears the category, and keeps it without category_name" do
    edit @recipe, category_name: "ontbijt"
    assert_response :ok
    assert_equal "Ontbijt", response.parsed_body["category"]["name"]

    edit @recipe.reload, title: "Flensjes"
    assert_equal categories(:ontbijt), @recipe.reload.category

    assert_difference("Category.count", 1) { edit @recipe, category_name: "Zondag" }
    assert_equal "Zondag", @recipe.reload.category.name

    edit @recipe, category_name: ""
    assert_response :ok
    assert_nil response.parsed_body["category"]
    assert_nil @recipe.reload.category
  end

  test "an older recipe without a category can be given one" do
    edit @older, category_name: "Diner"

    assert_response :ok
    assert_equal categories(:diner), @older.reload.category
  end

  test "an id of another recipe's row is refused" do
    other = recipes(:erwtensoep).steps.create!(body: "Niet van jou.", position: 1)

    edit @recipe, steps_attributes: [ { id: other.id, body: "Gekaapt" } ]

    assert_response :not_found
    assert_equal "Niet van jou.", other.reload.body
  end

  test "update reports a row error with its index in the request, also with removed rows" do
    beslag, melk, bakken = @recipe.steps.to_a

    edit @recipe, steps_attributes: [ { id: beslag.id, body: beslag.body }, { id: bakken.id, body: "" }, { id: melk.id, _destroy: true } ]

    assert_response :unprocessable_content
    assert_equal [ "steps[1].body" ], response.parsed_body["errors"].keys
    assert_equal [ beslag.id, melk.id, bakken.id ], @recipe.reload.steps.map(&:id)
  end

  test "update cannot remove the last step" do
    edit @recipe, steps_attributes: @recipe.steps.map { |step| { id: step.id, _destroy: "1" } }

    assert_response :unprocessable_content
    assert_equal [ "moet opgegeven zijn" ], response.parsed_body["errors"]["steps"]
    assert_equal 3, @recipe.steps.count
  end

  test "editing counts towards the limit on public writes" do
    PublicWriteRateLimit::WRITES_PER_MINUTE.times do
      edit @recipe, servings: 0
      assert_response :unprocessable_content
    end

    edit @recipe, servings: 0
    assert_response :too_many_requests
  end

  private
    # lock_version defaults to the one the recipe has now: an editor who is up to date.
    def edit(recipe, lock_version: recipe.lock_version, **attributes)
      patch api_recipe_url(recipe), params: { recipe: { lock_version: lock_version, **attributes } }, as: :json
    end
end
