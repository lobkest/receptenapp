require "test_helper"

class Api::IngredientsControllerTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear # reset rate_limit counters
    @ei = ingredients(:ei)
  end

  test "index lists every ingredient by name, with its link and review state" do
    @ei.update!(needs_review: true)
    get api_ingredients_url, as: :json

    assert_response :ok
    assert_equal %w[ bloem ei melk saffraan spek zout ], response.parsed_body.map { |row| row["name"] }
    ei = response.parsed_body.find { |row| row["name"] == "ei" }
    assert_equal({ "id" => @ei.id, "name" => "ei", "nevo_food" => { "code" => 83, "name" => "Kippeneieren rauw" },
                   "label_values" => false, "needs_review" => true, "negligible" => false },
      ei.slice("id", "name", "nevo_food", "label_values", "needs_review", "negligible"))
    assert_nil response.parsed_body.find { |row| row["name"] == "zout" }["nevo_food"]
  end

  test "show has the NEVO values, conversions, label values and the units recipes use" do
    get api_ingredient_url(@ei), as: :json

    assert_response :ok
    body = response.parsed_body
    assert_equal 0, body["lock_version"]
    assert_equal 50, body["grams_per_piece"]
    assert_nil body["grams_per_ml"]
    assert_equal({ "kcal" => nil, "protein" => nil, "carbohydrates" => nil, "fat" => nil, "fiber" => nil }, body["label"])
    assert_equal [ "stuks" ], body["units"]
    assert_equal({ "id" => nevo_foods(:kippenei).id, "code" => 83, "name" => "Kippeneieren rauw", "official_name" => "Ei kippen- rauw gem",
                   "unit" => "g", "version" => "2025/9.0", "kcal" => 130, "protein" => 12, "carbohydrates" => 0, "fat" => 9,
                   "fiber" => nil }, body["nevo_food"])
  end

  test "an unknown ingredient is a Dutch 404" do
    get api_ingredient_url(id: 0), as: :json

    assert_response :not_found
    assert_equal "Ingrediënt niet gevonden.", response.parsed_body["error"]
  end

  test "update links, converts and sets label values, and clears needs_review" do
    @ei.update!(needs_review: true)

    patch api_ingredient_url(@ei), params: { ingredient: {
      lock_version: @ei.lock_version, nevo_food_id: nevo_foods(:melk).id, grams_per_piece: "55,5", grams_per_ml: "",
      label_kcal: "140", label_fiber: "0"
    } }, as: :json

    assert_response :ok
    @ei.reload
    assert_equal nevo_foods(:melk), @ei.nevo_food
    assert_equal BigDecimal("55.5"), @ei.grams_per_piece
    assert_equal 140, @ei.label_kcal
    assert_equal 0, @ei.label_fiber
    refute @ei.needs_review
    assert_equal "Melk halfvolle", response.parsed_body["nevo_food"]["name"]
    assert response.parsed_body["label_values"]
  end

  test "Klopt: only lock_version, which clears needs_review and keeps the rest" do
    @ei.update!(needs_review: true)

    patch api_ingredient_url(@ei), params: { ingredient: { lock_version: @ei.lock_version } }, as: :json

    assert_response :ok
    refute @ei.reload.needs_review
    assert_equal nevo_foods(:kippenei), @ei.nevo_food
  end

  test "unlinking: nevo_food_id null" do
    patch api_ingredient_url(@ei), params: { ingredient: { lock_version: 0, nevo_food_id: nil } }, as: :json

    assert_response :ok
    assert_nil @ei.reload.nevo_food
  end

  test "invalid values give 422 per field, nothing is saved" do
    patch api_ingredient_url(@ei), params: { ingredient: {
      lock_version: 0, nevo_food_id: 0, grams_per_piece: "-1", label_protein: "120"
    } }, as: :json

    assert_response :unprocessable_content
    assert_equal %w[ grams_per_piece label_protein nevo_food ], response.parsed_body["errors"].keys.sort
    assert_equal 50, @ei.reload.grams_per_piece
  end

  test "someone else saved in between: 409; without lock_version: 400" do
    patch api_ingredient_url(@ei), params: { ingredient: { lock_version: 5, grams_per_piece: 60 } }, as: :json
    assert_response :conflict
    assert_equal "Dit ingrediënt is intussen door iemand anders gewijzigd. Herlaad en probeer opnieuw.", response.parsed_body["error"]

    patch api_ingredient_url(@ei), params: { ingredient: { grams_per_piece: 60 } }, as: :json
    assert_response :bad_request
  end

  test "negligible can be set and is sent back" do
    zout = ingredients(:zout)
    patch api_ingredient_url(zout), params: { ingredient: { lock_version: 0, negligible: true } }, as: :json

    assert_response :ok
    assert zout.reload.negligible
    assert response.parsed_body["negligible"]
  end

  test "the name cannot be changed here" do
    patch api_ingredient_url(@ei), params: { ingredient: { lock_version: 0, name: "eieren" } }, as: :json

    assert_response :ok
    assert_equal "ei", @ei.reload.name
  end
end
