require "test_helper"

# Ticking off a line on the shopping list puts its ingredient in the house ("In huis"),
# through the same PATCH the offline queue sends later (frontend/src/stores/shoppingList.js).
class Api::ShoppingListPantryTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear # reset rate_limit counters
    @ei = ingredients(:ei)
    @zout = ingredients(:zout).tap { |zout| zout.update!(staple: true) }
  end

  test "ticking off puts something that is not a staple in the house; unticking takes it out" do
    item = ShoppingListItem.create!(name: "ei")

    check(item, true)
    assert @ei.reload.in_house?
    assert item.reload.pantry_changed

    check(item, false)
    refute @ei.reload.in_house?
    refute item.reload.pantry_changed
    refute PantryItem.exists?(ingredient: @ei)
  end

  test "what was in the house already stays there after unticking" do
    PantryItem.set!(@ei, true)
    item = ShoppingListItem.create!(name: "ei")

    check(item, true)
    refute item.reload.pantry_changed

    check(item, false)
    assert @ei.reload.in_house?
  end

  test "a staple that is out is in the house again after ticking off, and out after unticking" do
    PantryItem.set!(@zout, false)
    item = ShoppingListItem.create!(name: "zout")

    check(item, true)
    assert @zout.reload.in_house?
    refute PantryItem.exists?(ingredient: @zout), "the 'op' row is gone"

    check(item, false)
    refute @zout.reload.in_house?
  end

  test "sending the same tick twice (the offline queue) changes nothing the second time" do
    item = ShoppingListItem.create!(name: "ei")

    check(item, true)
    check(item, true)
    assert item.reload.pantry_changed, "the second tick does not forget the first"

    check(item, false)
    check(item, false)
    refute @ei.reload.in_house?
  end

  test "a line without an ingredient does nothing with the stock" do
    item = ShoppingListItem.create!(name: "wc-papier")
    assert_nil item.ingredient_id

    assert_no_difference("PantryItem.count") do
      check(item, true)
      check(item, false)
    end
    refute item.reload.pantry_changed
  end

  # Linking by name

  test "a line typed by hand or from the standard list gets the ingredient with that name" do
    post api_shopping_list_items_url, params: { shopping_list_item: { name: "  EI " } }, as: :json
    assert_equal @ei.id, response.parsed_body["ingredient_id"]

    post api_shopping_list_items_url, params: { shopping_list_items: [ { name: "Zout", source_label: "standaard" }, { name: "wc-papier" } ] }, as: :json
    assert_equal [ @zout.id, nil ], response.parsed_body.pluck("ingredient_id")
  end

  test "the browser cannot choose the ingredient itself" do
    post api_shopping_list_items_url, params: { shopping_list_item: { name: "wc-papier", ingredient_id: @ei.id } }, as: :json

    assert_nil response.parsed_body["ingredient_id"]
  end

  test "renaming a line links it again by name, unless ticking it off changed the stock" do
    item = ShoppingListItem.create!(name: "eitje")
    assert_nil item.ingredient_id

    patch api_shopping_list_item_url(item), params: { shopping_list_item: { name: "ei" } }, as: :json
    assert_equal @ei.id, response.parsed_body["ingredient_id"]

    check(item, true)
    patch api_shopping_list_item_url(item), params: { shopping_list_item: { name: "zout" } }, as: :json
    assert_equal @ei.id, response.parsed_body["ingredient_id"], "unticking must undo it for ei"
  end

  private
    def check(item, checked)
      patch api_shopping_list_item_url(item), params: { shopping_list_item: { checked: checked } }, as: :json
      assert_response :ok
    end
end
