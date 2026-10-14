require "test_helper"

class RecipeVariationTest < ActiveSupport::TestCase
  setup do
    @recipe = recipes(:pannenkoeken) # bloem, melk, ei, zout (optional); tags vega and zoet
    @spek = recipe_variations(:spek) # − melk, + 100 g spek, − vega
    @bloem = recipe_ingredients(:pannenkoeken_bloem)
    @melk = recipe_ingredients(:pannenkoeken_melk)
  end

  def build_variation(**attributes)
    @recipe.variations.build(name: "Variatie", **attributes)
  end

  # ---------- Ingredient changes ----------

  test "a variation removes rows of the base recipe and adds its own ingredients" do
    variation = build_variation(removed_ingredient_ids: [ @bloem.id, @bloem.id.to_s ],
      added_ingredients: [ { name: "  Rijst MEEL ", quantity: "1,5", unit: "g" }, { name: "kaneel", quantity: "", unit: "g" } ])

    assert variation.save, variation.errors.full_messages.inspect
    variation.reload
    assert_equal [ @bloem.id ], variation.removed_ingredient_ids
    assert_equal [ [ "rijst meel", BigDecimal("1.5"), "g" ], [ "kaneel", nil, nil ] ],
      variation.additions.map { |addition| [ addition.name, addition.quantity, addition.unit ] }
  end

  test "a row of another recipe cannot be removed" do
    other = Recipe.create!(title: "Tosti", recipe_ingredients_attributes: [ { ingredient_name: "kaas", quantity: 1, unit: "stuks" } ],
      steps_attributes: [ { body: "Bakken." } ])

    variation = build_variation(removed_ingredient_ids: [ other.recipe_ingredients.first.id ])

    assert_not variation.save
    assert_equal [ "hoort niet bij dit recept" ], variation.errors["removals.recipe_ingredient"]
  end

  test "an unknown row cannot be removed either" do
    variation = build_variation(removed_ingredient_ids: [ 0, "abc" ])

    assert_not variation.valid?
    assert variation.errors.key?(:"removals.recipe_ingredient")
  end

  test "an added ingredient follows the rules of a recipe ingredient" do
    variation = build_variation(added_ingredients: [ { name: "kip", quantity: "150", unit: nil },
      { name: "", quantity: "abc", unit: "g" }, { name: "rijst", quantity: "0", unit: "kg" } ])

    assert_not variation.valid?
    assert_equal [ "moet opgegeven zijn" ], variation.errors["additions[0].unit"]
    assert_includes variation.errors["additions[1].name"], "moet opgegeven zijn"
    assert_includes variation.errors["additions[1].quantity"], "is geen getal"
    assert variation.errors.key?(:"additions[2].quantity")
    assert variation.errors.key?(:"additions[2].unit")
  end

  test "a unit without an amount is dropped, like on a recipe" do
    variation = build_variation(added_ingredients: [ { name: "peper", quantity: nil, unit: "g" } ])

    assert variation.save
    assert_nil variation.additions.first.reload.unit
  end

  test "the database refuses a change whose fields do not match its kind" do
    {
      "remove with a name" => { kind: "remove", recipe_ingredient_id: @bloem.id, name: "bloem" },
      "remove without a row" => { kind: "remove" },
      "add without a name" => { kind: "add", quantity: 1, unit: "g" },
      "add with a row" => { kind: "add", name: "kip", recipe_ingredient_id: @bloem.id },
      "unit without amount" => { kind: "add", name: "kip", unit: "g" },
      "unknown kind" => { kind: "swap", name: "kip" }
    }.each do |description, attributes|
      assert_raises(ActiveRecord::StatementInvalid, description) do
        VariationChange.insert!({ recipe_variation_id: @spek.id }.merge(attributes))
      end
    end
  end

  test "the same row can be removed only once per variation" do
    assert_raises(ActiveRecord::RecordNotUnique) do
      VariationChange.insert!({ recipe_variation_id: @spek.id, kind: "remove", recipe_ingredient_id: @melk.id })
    end
  end

  test "removed_ingredient_ids keeps the removals that stay" do
    removal = @spek.removals.sole

    @spek.update!(removed_ingredient_ids: [ @melk.id, @bloem.id ])
    assert_includes @spek.reload.removals, removal

    @spek.update!(removed_ingredient_ids: [])
    assert_empty @spek.reload.removals
  end

  # ---------- Tags ----------

  test "a variation takes off tags of the recipe and adds others, also new ones" do
    variation = build_variation(added_tag_names: [ " Hartig " ], removed_tag_names: [ "zoet" ])

    assert_difference("Tag.count", 1) { assert variation.save }
    assert_equal [ "hartig" ], variation.reload.added_tag_names
    assert_equal [ "zoet" ], variation.removed_tag_names
  end

  test "it cannot add a tag the recipe has, nor take off one it does not have" do
    variation = build_variation(added_tag_names: [ "vega" ], removed_tag_names: [ "soep" ])

    assert_not variation.save
    assert_equal [ "bevat \"vega\", maar die tag heeft het recept al" ], variation.errors[:added_tag_names]
    assert_equal [ "bevat \"soep\", maar die tag heeft het recept niet" ], variation.errors[:removed_tag_names]
  end

  test "the tag rules also hold for a tag change made directly" do
    added = VariationTagChange.new(recipe_variation: @spek, tag: tags(:zoet), kind: "add")
    removed = VariationTagChange.new(recipe_variation: @spek, tag: tags(:soep), kind: "remove")

    assert_equal [ "staat al op het recept" ], added.tap(&:valid?).errors[:tag]
    assert_equal [ "staat niet op het recept" ], removed.tap(&:valid?).errors[:tag]
  end

  test "a tag change that no longer fits goes when the recipe's tags change" do
    hartig = build_variation(added_tag_names: [ "hartig" ])
    hartig.save!

    @recipe.update!(tag_names: %w[ zoet hartig ])

    assert_empty @spek.reload.removed_tag_names # vega is gone from the recipe
    assert_empty hartig.reload.added_tag_names # the recipe has hartig itself now
  end

  # ---------- Limits and order ----------

  test "a recipe has at most 10 variations, hidden ones included" do
    8.times { |index| build_variation(name: "Variatie #{index}").save! }
    assert_equal 10, @recipe.variations.count

    variation = build_variation
    assert_not variation.save
    assert_equal [ "Dit recept heeft al 10 variaties, het maximum" ], variation.errors[:base]
  end

  test "a new variation goes at the end" do
    assert_equal 3, build_variation.tap(&:save!).position
  end

  test "the name is required and at most 60 characters" do
    assert_not build_variation(name: "  ").valid?
    assert_not build_variation(name: "a" * 61).valid?
    assert build_variation(name: "a" * 60).valid?
  end

  # ---------- The recipe changes underneath ----------

  test "editing the recipe keeps the row ids, so a removal stays attached" do
    @recipe.update!(recipe_ingredients_attributes: [
      { id: @bloem.id, ingredient_name: "bloem", quantity: 300, unit: "g" },
      { id: @melk.id, ingredient_name: "melk", quantity: 600, unit: "ml" }
    ])

    assert_equal [ @melk.id ], @spek.reload.removed_ingredient_ids
    assert_equal 600, @melk.reload.quantity
  end

  test "removing the row from the recipe also removes it from the variation" do
    @recipe.update!(recipe_ingredients_attributes: [ { id: @melk.id, _destroy: "1" } ])

    assert_empty @spek.reload.removals
    assert_equal [ "spek" ], @spek.additions.map(&:name)
  end

  test "a variation submitted with a recipe edit cannot remove a row that edit removes" do
    @recipe.update(recipe_ingredients_attributes: [ { id: @bloem.id, _destroy: "1" } ],
      variations_attributes: [ { name: "Zonder bloem", removed_ingredient_ids: [ @bloem.id ] } ])

    assert_equal [ "wordt tegelijk uit het recept gehaald" ], @recipe.errors["variations[0].removals.recipe_ingredient"]
    assert @bloem.reload
  end

  # ---------- History ----------

  test "every change to a variation is a new version of the recipe; a deletion request is not" do
    RecipeVersion.record!(@recipe)

    assert_difference("RecipeVersion.count", 1) { @spek.update!(name: "Met veel spek") }
    assert_equal "Gewijzigd: variaties", @recipe.versions.newest_first.first.summary
    assert_no_difference("RecipeVersion.count") { @spek.request_deletion!("dubbel") }
  end

  test "a variation on a recipe without versions keeps the old state first" do
    build_variation(name: "Met kaas").save!

    older, newer = @recipe.versions.order(:id).to_a
    assert_equal "Oorspronkelijke versie", older.summary
    assert_equal [ "Met spek", "Glutenvrij" ], older.snapshot["variations"].pluck("name")
    assert_equal [ "Met spek", "Glutenvrij", "Met kaas" ], newer.snapshot["variations"].pluck("name")
  end

  test "restore_version! brings back the variations, with removals linked to the new rows" do
    original = RecipeVersion.record!(@recipe)
    hidden = recipe_variations(:glutenvrij)

    # Replace every row (new ids), change "Met spek", delete it, and add a new variation.
    @recipe.update!(recipe_ingredients_attributes: @recipe.recipe_ingredients.map { |row| { id: row.id, _destroy: "1" } } +
      [ { ingredient_name: "spelt", quantity: 200, unit: "g" } ])
    @spek.update!(name: "Anders", added_ingredients: [])
    @spek.destroy!
    build_variation(name: "Nieuw").save!

    @recipe.reload.restore_version!(original)

    @recipe.reload
    assert_equal original.snapshot.except("variations"), RecipeVersion.snapshot_of(@recipe).except("variations")
    restored = @recipe.variations.find_by!(name: "Met spek")
    assert_equal [ "melk" ], restored.removals.map(&:ingredient_name)
    assert_equal @recipe.recipe_ingredients.find { |row| row.ingredient_name == "melk" }.id, restored.removed_ingredient_ids.sole
    assert_equal [ [ "spek", BigDecimal("100"), "g" ] ], restored.additions.map { |a| [ a.name, a.quantity, a.unit ] }
    assert_equal [ "vega" ], restored.removed_tag_names
    assert_equal "Spek eerst uitbakken.", restored.notes
    assert_equal [ "Met spek", "Glutenvrij" ], @recipe.variations.map(&:name)
    # The hidden one is still there and still hidden, now without bloem again.
    assert hidden.reload.deletion_requested?
    assert_equal [ "bloem" ], hidden.removals.map(&:ingredient_name)
    assert_match "Teruggezet naar de versie van", @recipe.versions.newest_first.first.summary
  end

  test "restoring a version from before variations existed keeps the current variations" do
    old = RecipeVersion.record!(@recipe)
    old.update_columns(snapshot: old.snapshot.except("variations"))

    @recipe.reload.restore_version!(old)

    assert_equal [ "melk" ], @spek.reload.removals.map(&:ingredient_name)
    assert_equal 2, @recipe.variations.count
  end

  test "the version label says om, like the heading of the versions list" do
    version = RecipeVersion.record!(@recipe)
    version.update_columns(created_at: Time.utc(2026, 10, 14, 18, 30))

    assert_equal "14 oktober 2026 om 20:30", version.label
  end

  # ---------- Variatie op lijst ----------

  test "shopping_list_items: the recipe without removals and optional ones, plus additions, scaled" do
    @spek.update!(added_ingredients: [ { name: "spek", quantity: 100, unit: "g" }, { name: "peper", quantity: nil, unit: nil },
      { name: "appel", quantity: 1, unit: "stuks" } ])

    items = @spek.shopping_list_items(servings: 6) # recipe is for 4: × 1,5

    assert_equal [
      [ "bloem", BigDecimal("375"), "g" ], [ "ei", BigDecimal("3"), "stuks" ],
      [ "spek", BigDecimal("150"), "g" ], [ "peper", nil, nil ], [ "appel", BigDecimal("1.5"), "stuks" ]
    ], items.map { |item| item.values_at(:name, :quantity, :unit) }
    assert_equal [ "Pannenkoeken (variatie: Met spek)" ], items.pluck(:source_label).uniq
    assert_equal [ @recipe.id ], items.pluck(:recipe_id).uniq
  end

  test "Quantity rounds like the frontend" do
    assert_equal BigDecimal("214"), Quantity.round(BigDecimal("213.7"), "g")
    assert_equal BigDecimal("2.3"), Quantity.round(BigDecimal("2.25"), "ml")
    assert_equal BigDecimal("1.5"), Quantity.round(BigDecimal("1.3"), "stuks")
    assert_equal BigDecimal("0.5"), Quantity.round(BigDecimal("0.25"), "stuks")
    assert_equal BigDecimal("0.1"), Quantity.round(BigDecimal("0.01"), "g")
    assert_nil Quantity.scale(nil, 2, "g")
  end

  # ---------- Nested in a recipe ----------

  test "a new recipe can come with a variation, which adds and takes off tags but removes nothing" do
    recipe = Recipe.create!(title: "Curry", tag_names: %w[ vega ],
      recipe_ingredients_attributes: [ { ingredient_name: "tofu", quantity: 200, unit: "g" } ],
      steps_attributes: [ { body: "Koken." } ],
      variations_attributes: [ { name: "Met kip", added_ingredients: [ { name: "kip", quantity: 150, unit: "g" } ],
        removed_tag_names: [ "vega" ], added_tag_names: [ "vlees" ] } ])

    variation = recipe.variations.sole
    assert_equal [ "kip" ], variation.additions.map(&:name)
    assert_equal [ [ "vlees" ], [ "vega" ] ], [ variation.added_tag_names, variation.removed_tag_names ]
    # One version for the recipe with its variation, not one per part.
    assert_equal [ "Eerste versie" ], recipe.versions.map(&:summary)
    assert_equal [ "Met kip" ], recipe.versions.sole.snapshot["variations"].pluck("name")
  end

  test "errors of a variation in a recipe say which variation" do
    recipe = Recipe.new(title: "Curry", recipe_ingredients_attributes: [ { ingredient_name: "tofu", quantity: 200, unit: "g" } ],
      steps_attributes: [ { body: "Koken." } ],
      variations_attributes: [ { name: "", added_ingredients: [ { name: "kip", quantity: "abc", unit: "g" } ] } ])

    assert_not recipe.save
    assert_includes recipe.errors["variations[0].name"], "moet opgegeven zijn"
    assert_includes recipe.errors["variations[0].additions[0].quantity"], "is geen getal"
  end
end
