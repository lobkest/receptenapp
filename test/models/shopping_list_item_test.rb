require "test_helper"

class ShoppingListItemTest < ActiveSupport::TestCase
  test "standaard niet afgevinkt, zonder hoeveelheid, eenheid, herkomst of recept" do
    item = ShoppingListItem.create!(name: "brood")

    assert_equal false, item.checked
    assert_nil item.quantity
    assert_nil item.unit
    assert_nil item.source_label
    assert_nil item.recipe_id
  end

  test "hoeveelheid met een komma wordt een getal" do
    item = ShoppingListItem.new(name: "gist", quantity: " 1,5 ", unit: "g")

    assert item.valid?
    assert_equal BigDecimal("1.5"), item.quantity
  end

  test "ongeldige hoeveelheden worden geweigerd in plaats van 0" do
    [ "abc", "1,2,3", "0", "-1", "100000" ].each do |quantity|
      item = ShoppingListItem.new(name: "gist", quantity: quantity, unit: "g")
      assert_not item.valid?, quantity
      assert item.errors.key?(:quantity), quantity
    end
  end

  test "een lege hoeveelheid is nil, en dan valt de eenheid weg" do
    item = ShoppingListItem.new(name: "zout", quantity: "", unit: "g")

    assert item.valid?
    assert_nil item.quantity
    assert_nil item.unit
  end

  test "een hoeveelheid vraagt een bekende eenheid" do
    assert ShoppingListItem.new(name: "ui", quantity: 1, unit: nil).invalid?
    assert ShoppingListItem.new(name: "ui", quantity: 1, unit: "el").invalid?
  end

  test "naam is verplicht en wordt genormaliseerd" do
    assert_equal "rode ui", ShoppingListItem.create!(name: "  Rode   UI ").name

    item = ShoppingListItem.new(name: "  ")
    assert_not item.valid?
    assert_includes item.errors.full_messages, "Naam moet opgegeven zijn"
  end

  test "een onbekend recept geeft een validatiefout, geen databasefout" do
    item = ShoppingListItem.new(name: "ui", recipe_id: 0)

    assert_not item.valid?
    assert item.errors.key?(:recipe)
  end

  test "verwijderen van een recept laat de regel staan zonder recept" do
    bloem = shopping_list_items(:bloem)
    recipe = bloem.recipe
    recipe.recipe_ingredients.destroy_all
    recipe.steps.destroy_all
    recipe.destroy!

    assert_nil bloem.reload.recipe_id
    assert_equal "Pannenkoeken", bloem.source_label
  end

  test "dezelfde naam en eenheid nog een keer wordt een eigen regel met eigen herkomst" do
    bloem = shopping_list_items(:bloem)

    assert_difference("ShoppingListItem.count", 1) do
      ShoppingListItem.create!(name: " Bloem ", quantity: "100,5", unit: "g", source_label: "Wafels")
    end

    assert_equal 250, bloem.reload.quantity
    assert_equal "Pannenkoeken", bloem.source_label
    assert_equal [ [ 250, "Pannenkoeken" ], [ BigDecimal("100.5"), "Wafels" ] ],
      ShoppingListItem.where(name: "bloem").order(:id).pluck(:quantity, :source_label)
  end
end
