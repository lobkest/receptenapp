require "test_helper"

class RecipeVersionTest < ActiveSupport::TestCase
  setup do
    @recipe = recipes(:pannenkoeken)
  end

  test "a new recipe gets a first version with everything in it" do
    recipe = Recipe.create!(title: "Tosti", servings: 1, tag_names: %w[ snel ],
      recipe_ingredients_attributes: [ { ingredient_name: "kaas", quantity: "1,5", unit: "stuks", optional: true } ],
      steps_attributes: [ { body: "Beleggen." }, { body: "Bakken." } ])

    version = recipe.versions.sole
    assert_equal "Eerste versie", version.summary
    assert_equal({
      "title" => "Tosti", "description" => nil, "servings" => 1, "category" => nil, "tag_names" => [ "snel" ],
      "ingredients" => [ { "ingredient_name" => "kaas", "quantity" => "1.5", "unit" => "stuks", "optional" => true } ],
      "steps" => [ { "body" => "Beleggen." }, { "body" => "Bakken." } ],
      "variations" => []
    }, version.snapshot)
  end

  test "an existing recipe without versions keeps its old state before the first change" do
    @recipe.update!(title: "Flensjes")

    older, newer = @recipe.versions.order(:id).to_a
    assert_equal [ "Oorspronkelijke versie", "Pannenkoeken" ], [ older.summary, older.snapshot["title"] ]
    assert_equal [ "Gewijzigd: titel", "Flensjes" ], [ newer.summary, newer.snapshot["title"] ]
  end

  test "the summary names what changed, also in ingredients, steps and tags" do
    RecipeVersion.record!(@recipe)
    zout = recipe_ingredients(:pannenkoeken_zout)

    @recipe.update!(tag_names: %w[ zoet ], recipe_ingredients_attributes: [ { id: zout.id, _destroy: "1" } ])

    # Without vega, the variation "Met spek" no longer takes vega off: that changes it too.
    assert_equal "Gewijzigd: tags, ingrediënten en variaties", @recipe.versions.newest_first.first.summary
    assert_empty recipe_variations(:spek).tag_changes
  end

  test "saving without a change makes no new version" do
    RecipeVersion.record!(@recipe)

    assert_no_difference("RecipeVersion.count") { @recipe.update!(title: "Pannenkoeken") }
  end

  test "restore_version! brings back ingredients, steps and tags, and is itself a new version" do
    original = RecipeVersion.record!(@recipe)
    @recipe.update!(title: "Flensjes", tag_names: %w[ snel ],
      steps_attributes: @recipe.steps.map { |step| { id: step.id, _destroy: "1" } } + [ { body: "Bakken." } ],
      recipe_ingredients_attributes: @recipe.recipe_ingredients.map { |row| { id: row.id, _destroy: "1" } } +
        [ { ingredient_name: "spelt", quantity: 200, unit: "g" } ])

    @recipe.reload.restore_version!(original)

    @recipe.reload
    assert_equal original.snapshot, RecipeVersion.snapshot_of(@recipe)
    assert_equal [ 1, 2, 3 ], @recipe.steps.map(&:position)
    assert_equal 3, @recipe.versions.count
    assert_match "Teruggezet naar de versie van", @recipe.versions.newest_first.first.summary
  end

  test "a change of category is a new version, and restoring brings the old category back" do
    @recipe.update!(category_name: "Ontbijt")
    with_breakfast = @recipe.versions.newest_first.first
    assert_equal "Ontbijt", with_breakfast.snapshot["category"]

    @recipe.update!(category_name: "Diner")
    assert_equal "Gewijzigd: categorie", @recipe.versions.newest_first.first.summary

    @recipe.reload.restore_version!(with_breakfast)
    assert_equal categories(:ontbijt), @recipe.reload.category

    @recipe.update!(category_name: "")
    @recipe.reload.restore_version!(@recipe.versions.find_by!(summary: "Oorspronkelijke versie"))
    assert_nil @recipe.reload.category, "the original version had no category"
  end

  test "a version from before categories existed keeps the current category" do
    old = RecipeVersion.record!(@recipe)
    old.update_columns(snapshot: old.snapshot.except("category"))
    @recipe.update!(title: "Flensjes", category_name: "Lunch")

    @recipe.reload.restore_version!(old)

    assert_equal "Pannenkoeken", @recipe.reload.title
    assert_equal categories(:lunch), @recipe.category
  end

  test "an old snapshot without category counts as none: no new version for nothing" do
    old = RecipeVersion.record!(@recipe)
    old.update_columns(snapshot: old.snapshot.except("category"))

    assert_nil RecipeVersion.record!(@recipe.reload)
  end

  test "an old version without ingredients or steps can be restored too" do
    older = recipes(:stamppot)
    empty = RecipeVersion.record!(older)
    older.update!(recipe_ingredients_attributes: [ { ingredient_name: "kool", quantity: 1, unit: "stuks" } ],
      steps_attributes: [ { body: "Stampen." } ])

    older.reload.restore_version!(empty)

    assert_empty older.reload.recipe_ingredients
    assert_empty older.steps
  end

  test "at most 50 versions per recipe; the oldest go first" do
    55.times { |i| @recipe.update!(servings: (i % 40) + 1, description: "Versie #{i}") }

    assert_equal RecipeVersion::MAX_PER_RECIPE, @recipe.versions.count
    assert_equal "Versie 54", @recipe.versions.newest_first.first.snapshot["description"]
    assert_equal "Versie 5", @recipe.versions.order(:id).first.snapshot["description"]
  end

  test "deleting a recipe deletes its versions" do
    RecipeVersion.record!(@recipe)

    assert_difference("RecipeVersion.count", -1) { @recipe.destroy! }
  end
end
