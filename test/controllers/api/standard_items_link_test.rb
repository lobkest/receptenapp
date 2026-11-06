require "test_helper"

# Linking a standard item to an ingredient: the suggestions, link, unlink and reject_link.
class Api::StandardItemsLinkTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear # reset rate_limit counters
    @ui = Ingredient.create!(name: "ui")
    @uien = StandardItem.create!(name: "uien")
  end

  test "link_suggestions lists unlinked items with their candidates" do
    get link_suggestions_api_standard_items_url, as: :json

    assert_response :ok
    suggestion = response.parsed_body.find { |row| row["standard_item"]["name"] == "uien" }
    assert_equal [ { "id" => @ui.id, "name" => "ui" } ], suggestion["candidates"]
    assert_nil suggestion["standard_item"]["ingredient_id"]
  end

  test "link sets the ingredient and the open lines" do
    line = ShoppingListItem.create!(name: "uien")

    post link_api_standard_item_url(@uien), params: { ingredient_id: @ui.id }, as: :json

    assert_response :ok
    assert_equal @ui.id, response.parsed_body["ingredient_id"]
    assert_equal @ui.id, line.reload.ingredient_id
  end

  test "link with an unknown ingredient is a 404 and changes nothing" do
    post link_api_standard_item_url(@uien), params: { ingredient_id: 0 }, as: :json

    assert_response :not_found
    assert_nil @uien.reload.ingredient_id
  end

  test "link without an ingredient_id is a 400" do
    post link_api_standard_item_url(@uien), params: {}, as: :json

    assert_response :bad_request
  end

  test "unlink" do
    @uien.link_to!(@ui)

    post unlink_api_standard_item_url(@uien), as: :json

    assert_response :ok
    assert_nil response.parsed_body["ingredient_id"]
    assert_nil @uien.reload.ingredient_id
  end

  test "reject_link takes the pair out of the suggestions, also when sent twice" do
    2.times do
      post reject_link_api_standard_item_url(@uien), params: { ingredient_id: @ui.id }, as: :json
      assert_response :no_content
    end

    get link_suggestions_api_standard_items_url, as: :json
    assert_nil response.parsed_body.find { |row| row["standard_item"]["name"] == "uien" }
  end

  test "the standard list and the offline snapshot send ingredient_id" do
    @uien.link_to!(@ui)

    get api_standard_items_url, as: :json
    assert_equal @ui.id, response.parsed_body.find { |item| item["name"] == "uien" }["ingredient_id"]

    get api_offline_snapshot_url, as: :json
    assert_equal @ui.id, response.parsed_body["standard_items"].find { |item| item["name"] == "uien" }["ingredient_id"]
  end
end
