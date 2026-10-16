require "test_helper"

class RecipeIngredientAlternativeTest < ActiveSupport::TestCase
  setup do
    @recipe = recipes(:pannenkoeken)
    @melk = recipe_ingredients(:pannenkoeken_melk) # 500 ml
  end

  test "koppelt een bestaand ingrediënt of maakt een nieuw aan, zoals een gewone regel" do
    update_melk!(alternatives_attributes: [ { ingredient_name: "  BLOEM " } ])
    assert_equal ingredients(:bloem), @melk.reload.alternatives.sole.ingredient

    assert_difference("Ingredient.count", 1) do
      update_melk!(alternatives_attributes: [ { ingredient_name: "Haver  Melk", quantity: "450", unit: "ml" } ])
    end
    assert_equal "haver melk", @melk.reload.alternatives.last.ingredient.name
  end

  test "valideren alleen maakt nog geen ingrediënt aan" do
    alternative = @melk.alternatives.build(ingredient_name: "sojamelk")

    assert_no_difference("Ingredient.count") { assert alternative.valid? }
  end

  test "zonder hoeveelheid geldt die van het origineel" do
    same = @melk.alternatives.build(ingredient_name: "sojamelk", unit: "g")
    own = @melk.alternatives.build(ingredient_name: "havermelk", quantity: "0,4", unit: "stuks")

    assert same.valid?
    assert_nil same.unit, "een eenheid zonder hoeveelheid vervalt"
    assert_equal [ 500, "ml" ], [ same.effective_quantity, same.effective_unit ]
    assert_equal [ BigDecimal("0.4"), "stuks" ], [ own.effective_quantity, own.effective_unit ]
  end

  test "dezelfde regels voor hoeveelheid en eenheid als een ingrediënt" do
    assert_not @melk.alternatives.build(ingredient_name: "a", quantity: 0, unit: "g").valid?
    assert_not @melk.alternatives.build(ingredient_name: "b", quantity: 2, unit: nil).valid?
    assert_not @melk.alternatives.build(ingredient_name: "c", quantity: 2, unit: "kilo").valid?
    assert_not @melk.alternatives.build(ingredient_name: " ").valid?
    %w[ g ml stuks tl el ].each do |unit|
      assert @melk.alternatives.build(ingredient_name: "x#{unit}", quantity: 1, unit: unit).valid?, unit
    end
  end

  test "mag niet hetzelfde ingrediënt zijn als het origineel" do
    alternative = @melk.alternatives.build(ingredient_name: "Melk")

    assert_not alternative.valid?
    assert alternative.errors.added?(:ingredient_name, :same_as_original)
  end

  test "het origineel hernoemen naar een bestaand alternatief kan niet" do
    update_melk!(alternatives_attributes: [ { ingredient_name: "sojamelk" } ])

    assert_not update_melk(ingredient_name: "sojamelk")
    assert_equal [ "bevatten het ingrediënt zelf" ], @recipe.errors[:"recipe_ingredients[0].alternatives"]
  end

  test "origineel en alternatief omwisselen in één keer kan wel" do
    update_melk!(alternatives_attributes: [ { ingredient_name: "sojamelk" } ])
    alternative = @melk.reload.alternatives.sole

    assert update_melk(ingredient_name: "sojamelk", alternatives_attributes: [ { id: alternative.id, ingredient_name: "melk" } ])
    assert_equal [ "sojamelk", [ "melk" ] ], [ @melk.reload.ingredient_name, @melk.alternatives.map(&:ingredient_name) ]
  end

  test "geen dubbele alternatieven binnen één regel; de latere krijgt de fout" do
    @melk.assign_attributes(alternatives_attributes: [ { ingredient_name: "sojamelk" }, { ingredient_name: " SojaMelk" } ])

    assert_not @melk.valid?
    first, second = @melk.alternatives.to_a
    assert_empty first.errors
    assert second.errors.added?(:ingredient_name, :taken)
  end

  test "een nieuw alternatief dat een bestaand herhaalt, en een bestaand dat hernoemd wordt naar een ander" do
    update_melk!(alternatives_attributes: [ { ingredient_name: "sojamelk" }, { ingredient_name: "havermelk" } ])
    soja, haver = @melk.reload.alternatives.to_a

    assert_not update_melk(alternatives_attributes: [ { ingredient_name: "havermelk" } ])
    assert_equal [ "staat al als alternatief bij dit ingrediënt" ], @recipe.errors[:"recipe_ingredients[0].alternatives[0].ingredient_name"]
    assert_not update_melk(alternatives_attributes: [ { id: soja.id, ingredient_name: "havermelk" } ])
    assert_equal [ "sojamelk", "havermelk" ], @melk.reload.alternatives.map(&:ingredient_name)
    assert_equal haver, @melk.alternatives.last
  end

  test "hetzelfde alternatief bij twee verschillende regels mag" do
    update_melk!(alternatives_attributes: [ { ingredient_name: "water" } ])

    assert @recipe.reload.update(recipe_ingredients_attributes: [ { id: recipe_ingredients(:pannenkoeken_bloem).id,
      alternatives_attributes: [ { ingredient_name: "water" } ] } ])
  end

  test "positie volgt de volgorde; verwijderen met _destroy en samen met de regel" do
    update_melk!(alternatives_attributes: [ { ingredient_name: "sojamelk" }, { ingredient_name: "havermelk" }, { ingredient_name: "water" } ])
    soja, haver, water = @melk.reload.alternatives.to_a
    assert_equal [ 1, 2, 3 ], [ soja, haver, water ].map(&:position)

    update_melk!(alternatives_attributes: [ { id: soja.id, _destroy: "1" } ])
    assert_equal [ [ "havermelk", 1 ], [ "water", 2 ] ], @melk.reload.alternatives.map { |a| [ a.ingredient_name, a.position ] }

    assert_difference("RecipeIngredientAlternative.count", -2) do
      @recipe.reload.update!(recipe_ingredients_attributes: [ { id: @melk.id, _destroy: "1" } ])
    end
  end

  test "maximaal #{RecipeIngredient::MAX_ALTERNATIVES} alternatieven per regel" do
    @melk.assign_attributes(alternatives_attributes: (1..RecipeIngredient::MAX_ALTERNATIVES + 1).map { |n| { ingredient_name: "melk #{n}" } })

    assert_not @melk.valid?
    assert @melk.errors.added?(:alternatives, :too_many, count: RecipeIngredient::MAX_ALTERNATIVES)
  end

  test "een ingrediënt dat als alternatief in gebruik is, kan niet weg" do
    update_melk!(alternatives_attributes: [ { ingredient_name: "saffraan" } ])

    assert_not ingredients(:ongebruikt).destroy
  end

  test "versie: de snapshot bevat de alternatieven, en terugzetten brengt ze terug" do
    update_melk!(alternatives_attributes: [ { ingredient_name: "sojamelk" }, { ingredient_name: "havermelk", quantity: "450", unit: "ml" } ])
    version = @recipe.versions.newest_first.first
    assert_equal "Gewijzigd: ingrediënten", version.summary
    melk = version.snapshot["ingredients"].find { |row| row["ingredient_name"] == "melk" }
    assert_equal [
      { "ingredient_name" => "sojamelk", "quantity" => nil, "unit" => nil },
      { "ingredient_name" => "havermelk", "quantity" => "450.0", "unit" => "ml" }
    ], melk["alternatives"]
    assert_not version.snapshot["ingredients"].find { |row| row["ingredient_name"] == "bloem" }.key?("alternatives")

    update_melk!(alternatives_attributes: @melk.alternatives.map { |a| { id: a.id, _destroy: "1" } })
    assert_empty @melk.reload.alternatives

    @recipe.reload.restore_version!(version)
    restored = @recipe.reload.recipe_ingredients.find { |row| row.ingredient_name == "melk" }
    assert_equal [ [ "sojamelk", nil, nil, 1 ], [ "havermelk", BigDecimal(450), "ml", 2 ] ],
      restored.alternatives.map { |a| [ a.ingredient_name, a.quantity, a.unit, a.position ] }
  end

  test "versie: een recept zonder alternatieven geeft dezelfde snapshot als voorheen" do
    RecipeVersion.record!(@recipe)

    assert_no_difference("RecipeVersion.count") { RecipeVersion.record!(@recipe) }
    assert @recipe.versions.sole.snapshot["ingredients"].none? { |row| row.key?("alternatives") }
  end

  test "versie: terugzetten van een versie zonder alternatieven haalt ze weg" do
    version = RecipeVersion.record!(@recipe)
    update_melk!(alternatives_attributes: [ { ingredient_name: "sojamelk" } ])

    assert_difference("RecipeIngredientAlternative.count", -1) { @recipe.reload.restore_version!(version) }
  end

  private
    # Through the recipe, as the API does (nested attributes); the errors land on @recipe.
    def update_melk(**attributes)
      @recipe.reload.update(recipe_ingredients_attributes: [ { id: @melk.id, **attributes } ])
    end

    def update_melk!(**attributes)
      assert update_melk(**attributes), -> { @recipe.errors.full_messages.to_sentence }
    end
end
