require "test_helper"

class Importers::IngredientCleanupTest < ActiveSupport::TestCase
  # Pannenkoeken: 250 g bloem, 500 ml melk, 2 stuks ei, zout (optional). Stamppot: nothing.
  setup do
    @stamppot = recipes(:stamppot)
    @suiker = Ingredient.create!(name: "suiker")
    @stamppot.recipe_ingredients.create!(ingredient: Ingredient.create!(name: "suiker 2tl"))
    @stamppot.recipe_ingredients.create!(ingredient: Ingredient.create!(name: "eieren"), quantity: 2, unit: "stuks")
    @stamppot.recipe_ingredients.create!(ingredient: Ingredient.create!(name: "yohgurt"), quantity: 150, unit: "g")
    @stamppot.recipe_ingredients.create!(ingredient: Ingredient.create!(name: "gh"))
    Ingredient.create!(name: "eten")
    ingredients(:ei).update!(needs_review: true)
  end

  DECISIONS = {
    "quantity_in_name" => { "suiker 2tl" => { "into" => "suiker", "quantity" => 2, "unit" => "tl" } },
    "merge" => { "eieren" => "ei", "bestaat niet" => "ei" },
    "rename" => { "yohgurt" => "yoghurt" },
    "junk" => [ "gh", "eten" ],
    "ingredients" => {
      "ei" => { "code" => 83, "grams_per_piece" => 55, "reviewed" => true },
      "melk" => { "grams_per_ml" => 1.03, "reviewed" => true },
      "zout" => { "code" => 9001, "reviewed" => false, "note" => "kijk op het etiket" },
      "saffraan" => { "negligible" => true, "reviewed" => true }
    }
  }.freeze

  def run_cleanup(dry_run: false, decisions: DECISIONS)
    Importers::IngredientCleanup.new(decisions, dry_run: dry_run).call
  end

  test "dry run prints everything and writes nothing" do
    output = assert_no_difference([ "Ingredient.count", "RecipeVersion.count" ]) { run_cleanup(dry_run: true) }

    assert_includes output, "DRY RUN"
    assert_includes output, "eieren → ei"
    assert Ingredient.exists?(name: "yohgurt")
    assert_nil @stamppot.recipe_ingredients.find_by(ingredient: Ingredient.find_by(name: "suiker 2tl")).quantity
    assert ingredients(:ei).reload.needs_review
    refute ingredients(:ongebruikt).reload.negligible
  end

  test "does every step, and a second run changes nothing and gives no errors" do
    output = run_cleanup

    suiker_row = @stamppot.recipe_ingredients.reload.find { |row| row.ingredient_name == "suiker" }
    assert_equal [ BigDecimal(2), "tl" ], [ suiker_row.quantity, suiker_row.unit ]
    refute Ingredient.exists?(name: "suiker 2tl")
    refute Ingredient.exists?(name: "eieren")
    assert_includes @stamppot.recipe_ingredients.map(&:ingredient_name), "ei"
    assert Ingredient.exists?(name: "yoghurt")
    refute Ingredient.exists?(name: "eten")
    # gh is used: it stays, and the report says where.
    assert Ingredient.exists?(name: "gh")
    assert_includes output, "gh: NIET verwijderd, gebruikt in Stamppot (geen hoeveelheid)"
    assert_includes output, "bestaat niet → ei: bestaat niet niet gevonden, overgeslagen"

    ei = ingredients(:ei).reload
    assert_equal 55, ei.grams_per_piece
    refute ei.needs_review
    assert_includes output, "ei: g/stuk 50 → 55; gecontroleerd"
    assert_equal BigDecimal("1.03"), ingredients(:melk).reload.grams_per_ml
    zout = ingredients(:zout).reload
    assert_equal nevo_foods(:melk), zout.nevo_food
    assert zout.needs_review
    assert_includes output, "Zelf doen (1):\n  zout: kijk op het etiket"
    assert ingredients(:ongebruikt).reload.negligible
    assert_includes output, "saffraan: verwaarloosbaar | niet gekoppeld, verwaarloosbaar | geen omrekening | gecontroleerd"

    again = assert_no_difference([ "Ingredient.count", "RecipeVersion.count" ]) { run_cleanup }
    assert_includes again, "suiker 2tl: niet gevonden, overgeslagen"
    assert_includes again, "ei: ongewijzigd"
    assert_includes again, "saffraan: ongewijzigd"
  end

  test "a recipe with source and target is skipped and goes on the to-do list" do
    recipes(:pannenkoeken).recipe_ingredients.create!(ingredient: Ingredient.find_by!(name: "eieren"), quantity: 1, unit: "stuks")

    output = run_cleanup(decisions: { "merge" => { "eieren" => "ei" } })

    assert Ingredient.exists?(name: "eieren")
    assert_includes output, "eieren → ei: niet samengevoegd in Pannenkoeken (bevat allebei); eieren blijft daarom bestaan"
  end

  test "variation names go to an existing ingredient, and create makes a linked one" do
    recipe_variations(:spek).additions.create!(name: "kipschnitzel", quantity: 1, unit: "stuks")
    decisions = {
      "variation_names" => { "spek" => "ei" },
      "ingredients" => { "kipschnitzel" => { "create" => true, "code" => 83, "grams_per_piece" => 150, "reviewed" => true } }
    }

    output = run_cleanup(decisions: decisions)

    assert_equal %w[ ei kipschnitzel ], recipe_variations(:spek).additions.reload.map(&:name).sort
    assert_includes output, "spek → ei (Pannenkoeken / Met spek)"
    kipschnitzel = Ingredient.find_by!(name: "kipschnitzel")
    assert_equal [ nevo_foods(:kippenei), 150 ], [ kipschnitzel.nevo_food, kipschnitzel.grams_per_piece ]
    # The variation now counts both.
    assert_empty Nutrition.for_variation(recipe_variations(:spek)).to_h["not_counted"].select { |line| line["reason"] == "niet gekoppeld" }

    again = assert_no_difference("Ingredient.count") { run_cleanup(decisions: decisions) }
    assert_includes again, "spek → ei: niet gevonden, overgeslagen"
  end

  test "a wrong file stops before anything changes" do
    assert_raises(Importers::IngredientCleanup::InvalidFile) { run_cleanup(decisions: { "mergen" => {} }) }

    error = assert_raises(Importers::IngredientCleanup::InvalidFile) do
      run_cleanup(decisions: { "merge" => { "eieren" => "ei" }, "ingredients" => { "ei" => { "code" => 1 } } })
    end
    assert_includes error.message, "NEVO-code 1 bestaat niet"
    # The merge before it was rolled back too.
    assert Ingredient.exists?(name: "eieren")
  end
end
