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
    assert ShoppingListItem.new(name: "ui", quantity: 1, unit: "cup").invalid?
    assert ShoppingListItem.new(name: "olie", quantity: 1, unit: "el").valid?
    assert ShoppingListItem.new(name: "zout", quantity: 1, unit: "tl").valid?
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
  # The same rules as recipe_ingredients and variation_changes, also in the database:
  # update_columns skips the validations, so only the check constraints stop these.
  {
    "een hoeveelheid van 0" => { quantity: 0 },
    "een negatieve hoeveelheid" => { quantity: -1 },
    "een onbekende eenheid" => { unit: "cup" },
    "een hoeveelheid zonder eenheid" => { unit: nil },
    "een eenheid zonder hoeveelheid" => { quantity: nil }
  }.each do |description, columns|
    test "de database weigert #{description}, ook zonder validaties" do
      assert_raises(ActiveRecord::CheckViolation) do
        shopping_list_items(:bloem).update_columns(columns)
      end
    end
  end

  test "de database laat tl en el toe" do
    %w[ tl el ].each do |unit|
      shopping_list_items(:bloem).update_columns(unit: unit)

      assert_equal unit, shopping_list_items(:bloem).reload.unit
    end
  end

  test "de database laat naar smaak (geen hoeveelheid, geen eenheid) toe" do
    shopping_list_items(:bloem).update_columns(quantity: nil, unit: nil)

    assert_nil shopping_list_items(:bloem).reload.quantity
  end

  # standard_count

  test "standard_count is standaard 0 en nooit negatief, ook niet in de database" do
    item = ShoppingListItem.create!(name: "brood")
    assert_equal 0, item.standard_count

    item.standard_count = -1
    assert item.invalid?
    assert item.errors.key?(:standard_count)
    item.standard_count = 1.5
    assert item.invalid?

    assert_raises(ActiveRecord::StatementInvalid) { item.update_column(:standard_count, -1) }
  end

  test "een nieuwe regel van de standaardlijst telt één keer, ook zonder standard_count" do
    assert_equal 1, ShoppingListItem.create!(name: "kaas", source_label: "standaard").standard_count
    assert_equal 0, ShoppingListItem.create!(name: "kaas", source_label: "Pizza").standard_count
  end

  test "add_standard! maakt een nieuwe standaardregel als het er nog niet (open) op staat" do
    # melk (fixture) staat er al, maar is afgevinkt: telt niet.
    assert_difference("ShoppingListItem.count", 1) do
      line = ShoppingListItem.add_standard!(" Melk ")
      assert_equal [ "melk", "standaard", nil, nil, 1 ],
        [ line.name, line.source_label, line.recipe_id, line.quantity, line.standard_count ]
    end
  end

  test "add_standard! telt op bij een open standaardregel, ook als er een oudere receptregel is" do
    recipe_line = ShoppingListItem.create!(name: "melk", quantity: 200, unit: "ml",
      source_label: "Pannenkoeken", recipe: recipes(:pannenkoeken))
    standard_line = ShoppingListItem.create!(name: "melk", source_label: "standaard")

    assert_no_difference("ShoppingListItem.count") do
      assert_equal standard_line, ShoppingListItem.add_standard!("melk")
    end
    assert_equal 2, standard_line.reload.standard_count
    assert_equal 0, recipe_line.reload.standard_count
  end

  test "add_standard! telt anders op bij de oudste open regel, en laat de hoeveelheid staan" do
    oldest = ShoppingListItem.create!(name: "melk", quantity: 200, unit: "ml",
      source_label: "Pannenkoeken", recipe: recipes(:pannenkoeken))
    newer = ShoppingListItem.create!(name: "melk", quantity: 100, unit: "ml", source_label: "Wafels")

    assert_no_difference("ShoppingListItem.count") { ShoppingListItem.add_standard!("melk") }

    oldest.reload
    assert_equal [ 1, BigDecimal("200"), "ml", "Pannenkoeken" ],
      [ oldest.standard_count, oldest.quantity, oldest.unit, oldest.source_label ]
    assert_equal 0, newer.reload.standard_count
  end

  test "remove_standard! telt af; een standaardregel op 0 verdwijnt" do
    line = ShoppingListItem.create!(name: "kaas", source_label: "standaard", standard_count: 2)

    assert_equal line, line.remove_standard!
    assert_equal 1, line.reload.standard_count
    assert_nil line.remove_standard!
    assert_not ShoppingListItem.exists?(line.id)
  end

  test "remove_standard! laat bij een receptregel op 0 het receptdeel staan" do
    line = shopping_list_items(:bloem)
    line.update!(standard_count: 1)

    assert_equal line, line.remove_standard!
    line.reload
    assert_equal [ 0, BigDecimal("250"), recipes(:pannenkoeken).id ], [ line.standard_count, line.quantity, line.recipe_id ]
    # Nog een keer: er valt niets meer af te tellen.
    assert_equal line, line.remove_standard!
    assert_equal 0, line.reload.standard_count
  end

  test "remove_recipe_part! verwijdert een receptregel zonder standaarddeel" do
    line = shopping_list_items(:bloem)

    assert_nil line.remove_recipe_part!
    assert_not ShoppingListItem.exists?(line.id)
  end

  test "remove_recipe_part! maakt van een receptregel met standaarddeel een standaardregel" do
    line = shopping_list_items(:bloem)
    line.update!(standard_count: 2)

    assert_equal line, line.remove_recipe_part!
    line.reload
    assert_equal [ "bloem", nil, nil, nil, "standaard", 2, ingredients(:bloem).id ],
      [ line.name, line.quantity, line.unit, line.recipe_id, line.source_label, line.standard_count, line.ingredient_id ]
    assert line.standard_only?
  end
end
