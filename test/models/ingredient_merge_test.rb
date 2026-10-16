require "test_helper"

class IngredientMergeTest < ActiveSupport::TestCase
  setup do
    @ei = ingredients(:ei)
    @eieren = Ingredient.create!(name: "eieren")
  end

  def merge(source = @eieren, target = @ei)
    IngredientMerge.new(source, target).call
  end

  test "moves every reference to the target and deletes the source" do
    stamppot = recipes(:stamppot)
    row = stamppot.recipe_ingredients.create!(ingredient: @eieren, quantity: 3, unit: "stuks")
    alternative = recipe_ingredients(:pannenkoeken_melk).alternatives.create!(ingredient: @eieren, position: 1)
    addition = recipe_variations(:spek).additions.create!(name: "eieren", quantity: 1, unit: "stuks")
    line = ShoppingListItem.create!(name: "eieren")
    item = StandardItem.create!(name: "eieren")

    result = assert_difference("Ingredient.count", -1) { merge }

    assert result.source_deleted
    assert_equal [ "Pannenkoeken", "Stamppot" ], result.moved_recipes
    assert_empty result.skipped_recipes
    assert_equal @ei, row.reload.ingredient
    assert_equal BigDecimal(3), row.quantity
    assert_equal @ei, alternative.reload.ingredient
    assert_equal "ei", addition.reload.name
    assert_equal "ei", line.reload.name
    assert_equal "ei", item.reload.name
    refute Ingredient.exists?(name: "eieren")
  end

  test "changed recipes get a version and a higher lock_version" do
    stamppot = recipes(:stamppot)
    stamppot.recipe_ingredients.create!(ingredient: @eieren, quantity: 3, unit: "stuks")

    assert_changes(-> { stamppot.reload.lock_version }) { merge }
    assert_equal "Ingrediënt samengevoegd: eieren → ei", stamppot.versions.newest_first.first.summary
    assert_equal [ "ei" ], stamppot.versions.newest_first.first.snapshot["ingredients"].map { |r| r["ingredient_name"] }
    # The state before, for restoring.
    assert_equal "Oorspronkelijke versie", stamppot.versions.order(:id).first.summary
  end

  test "a standard list item that would be a double is removed" do
    StandardItem.create!(name: "eieren")
    StandardItem.create!(name: "ei")

    assert_difference("StandardItem.count", -1) { merge }
    assert_equal 1, StandardItem.where(name: "ei").count
  end

  test "takes over the NEVO link, conversions and label values the target lacks" do
    @ei.update!(nevo_food: nil, grams_per_piece: 55)
    @eieren.update!(nevo_food: nevo_foods(:kippenei), grams_per_piece: 60, grams_per_ml: 1.03, label_kcal: 140, needs_review: true)

    result = merge
    @ei.reload

    assert_equal nevo_foods(:kippenei), @ei.nevo_food
    assert @ei.needs_review
    # Its own gram per stuk stays.
    assert_equal 55, @ei.grams_per_piece
    assert_equal BigDecimal("1.03"), @ei.grams_per_ml
    assert_equal 140, @ei.label_kcal
    assert_equal %w[ nevo_food grams_per_ml label_kcal ], result.copied
  end

  test "keeps the target's own NEVO link" do
    @eieren.update!(nevo_food: nevo_foods(:melk))

    assert_empty merge.copied
    assert_equal nevo_foods(:kippenei), @ei.reload.nevo_food
  end

  test "a recipe with both is skipped: both rows stay, and so does the source" do
    pannenkoeken = recipes(:pannenkoeken)
    pannenkoeken.recipe_ingredients.create!(ingredient: @eieren, quantity: 1, unit: "stuks")
    stamppot = recipes(:stamppot)
    moved = stamppot.recipe_ingredients.create!(ingredient: @eieren, quantity: 3, unit: "stuks")
    recipe_variations(:spek).additions.create!(name: "eieren", quantity: 1, unit: "stuks")

    result = assert_no_difference("Ingredient.count") { merge }

    refute result.source_deleted
    assert_equal [ "Pannenkoeken" ], result.skipped_recipes
    assert_equal [ "Stamppot" ], result.moved_recipes
    assert_equal [ "ei", "eieren" ], pannenkoeken.recipe_ingredients.reload.map(&:ingredient_name).grep(/^ei/).sort
    assert_equal @ei, moved.reload.ingredient
    # The variation belongs to the skipped recipe: it keeps the source.
    assert_equal [ "eieren" ], recipe_variations(:spek).additions.reload.map(&:name).grep(/^ei/)
  end

  test "the source as alternative of a target row is a conflict too" do
    recipe_ingredients(:pannenkoeken_ei).alternatives.create!(ingredient: @eieren, position: 1)

    result = merge

    assert_equal [ "Pannenkoeken" ], result.skipped_recipes
    assert Ingredient.exists?(@eieren.id)
  end

  test "a failure rolls everything back" do
    row = recipes(:stamppot).recipe_ingredients.create!(ingredient: @eieren, quantity: 3, unit: "stuks")
    line = ShoppingListItem.create!(name: "eieren")
    # Fails after the rows and names have moved.
    failing = Class.new(IngredientMerge) do
      private def copy_nutrition = raise("kapot")
    end

    assert_raises(RuntimeError) { failing.new(@eieren, @ei).call }
    assert_equal @eieren, row.reload.ingredient
    assert_equal "eieren", line.reload.name
    assert Ingredient.exists?(@eieren.id)
  end

  test "an ingredient cannot be merged into itself" do
    assert_raises(IngredientMerge::Invalid) { merge(@ei, @ei) }
  end
end
