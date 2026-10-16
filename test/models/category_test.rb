require "test_helper"

class CategoryTest < ActiveSupport::TestCase
  test "naam wordt getrimd, maar houdt zijn hoofdletters" do
    assert_equal "Verse soep", Category.create!(name: "  Verse   soep ", position: 5).name
  end

  test "naam is verplicht en maximaal 30 tekens; positie is verplicht" do
    assert_not Category.new(name: "  ", position: 5).valid?
    assert_not Category.new(name: "a" * 31, position: 5).valid?
    assert Category.new(name: "a" * 30, position: 5).valid?
    assert_not Category.new(name: "Brunch", position: nil).valid?
  end

  test "naam is uniek, ongeacht hoofdletters" do
    category = Category.new(name: " ONTBIJT ", position: 5)

    assert_not category.valid?
    assert_includes category.errors.full_messages, "Naam is al in gebruik"
  end

  test "de database bewaakt de uniekheid ook, ongeacht hoofdletters" do
    assert_raises(ActiveRecord::RecordNotUnique) do
      Category.insert_all!([ { name: "ontbijt", position: 9 } ])
    end
  end

  test "Overig is gereserveerd voor recepten zonder categorie" do
    category = Category.new(name: "overig", position: 5)

    assert_not category.valid?
    assert_includes category.errors.full_messages, "Naam kan niet \"Overig\" zijn, die naam is gereserveerd"
  end

  test "find_named vindt een categorie ongeacht hoofdletters en spaties" do
    assert_equal categories(:diner), Category.find_named("  dINER ")
    assert_nil Category.find_named("Brunch")
  end

  test "named hergebruikt een bestaande categorie en zet een nieuwe achteraan" do
    assert_no_difference("Category.count") { assert_equal categories(:lunch), Category.named("LUNCH") }

    brunch = assert_difference("Category.count", 1) { Category.named("Brunch") }
    assert_equal [ "Brunch", 5 ], [ brunch.name, brunch.position ]
    assert_equal %w[ Ontbijt Lunch Diner Snacks Brunch ], Category.ordered.map(&:name)
  end

  test "named geeft de bestaande categorie terug als een andere request hem net aanmaakte" do
    diner = categories(:diner)
    # De eerste find_named ziet hem (nog) niet, alsof een andere request hem net aanmaakte.
    # find_named is Category's own class method, so we keep it and put it back afterwards.
    original = Category.method(:find_named)
    calls = 0
    Category.define_singleton_method(:find_named) { |*args| (calls += 1) == 1 ? nil : original.call(*args) }

    assert_no_difference("Category.count") { assert_equal diner, Category.named("diner") }
  ensure
    Category.define_singleton_method(:find_named, original)
  end

  test "een recept heeft geen categorie nodig" do
    recipe = recipes(:pannenkoeken)

    assert_nil recipe.category
    assert recipe.valid?
  end

  test "verwijderen maakt de categorie van recepten leeg, de recepten blijven" do
    recipe = recipes(:pannenkoeken)
    recipe.update!(category: categories(:ontbijt))

    assert_no_difference("Recipe.count") { categories(:ontbijt).destroy! }
    assert_nil recipe.reload.category_id
  end
end
