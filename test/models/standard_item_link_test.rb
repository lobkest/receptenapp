require "test_helper"

# A standard item linked by hand to an ingredient with another name ("uien" is "ui"):
# StandardItem#link_to!, the shopping list (ShoppingListItem), IngredientMerge and the
# suggestions (StandardItemLinkSuggestions).
class StandardItemLinkTest < ActiveSupport::TestCase
  setup do
    @ui = Ingredient.create!(name: "ui")
    @uien = StandardItem.create!(name: "uien")
  end

  def suggestions_for(item)
    StandardItemLinkSuggestions.call.find { |suggestion| suggestion[:item] == item }&.dig(:candidates)
  end

  test "linking gives open lines with the name the ingredient, but not ticked-off ones" do
    open_line = ShoppingListItem.create!(name: "uien")
    ticked = ShoppingListItem.create!(name: "uien")
    ticked.update!(checked: true)
    other = ShoppingListItem.create!(name: "prei")

    @uien.link_to!(@ui)

    assert_equal @ui, @uien.reload.ingredient
    assert_equal @ui.id, open_line.reload.ingredient_id
    assert_nil ticked.reload.ingredient_id
    assert_not ticked.pantry_changed
    assert_nil other.reload.ingredient_id
  end

  test "a new line with the name of a linked item gets the ingredient" do
    @uien.link_to!(@ui)

    line = ShoppingListItem.add_loose!(name: "Uien")

    assert_equal @ui.id, line.ingredient_id
  end

  test "an ingredient with exactly the name still comes first" do
    Ingredient.create!(name: "uien")
    @uien.link_to!(@ui)

    assert_equal "uien", ShoppingListItem.create!(name: "uien").ingredient.name
  end

  test "the standard list adds one to an open line of the linked ingredient" do
    recipe_line = ShoppingListItem.create!(name: "ui", ingredient: @ui, quantity: 2, unit: "stuks")
    @uien.link_to!(@ui)

    line = ShoppingListItem.add_standard!("uien")

    assert_equal recipe_line, line
    assert_equal 2, line.count
    assert_equal 1, line.standard_count
  end

  test "without a link the standard list does not touch a line with another name" do
    ShoppingListItem.create!(name: "ui", ingredient: @ui)

    line = ShoppingListItem.add_standard!("uien")

    assert_equal "uien", line.name
    assert_nil line.ingredient_id
  end

  test "unlinking keeps the lines as they are" do
    @uien.link_to!(@ui)
    line = ShoppingListItem.create!(name: "uien")

    @uien.unlink!

    assert_nil @uien.reload.ingredient_id
    assert_equal @ui.id, line.reload.ingredient_id
  end

  test "an unknown ingredient id is invalid" do
    @uien.ingredient_id = 0

    assert_not @uien.valid?
    assert @uien.errors.added?(:ingredient, :blank)
  end

  test "deleting the ingredient unlinks the item" do
    @uien.link_to!(@ui)

    @ui.destroy!

    assert_nil @uien.reload.ingredient_id
  end

  test "merging the ingredient moves the link to the target" do
    @uien.link_to!(@ui)
    target = Ingredient.create!(name: "gele ui")

    IngredientMerge.new(@ui, target).call

    assert_equal target.id, @uien.reload.ingredient_id
  end

  test "serialize sends ingredient_id" do
    @uien.link_to!(@ui)

    assert_equal @ui.id, StandardItem.serialize(@uien)["ingredient_id"]
  end

  # ---------- Suggestions ----------

  test "stem takes off one plural ending, but not down to one letter" do
    assert_equal "ui", StandardItemLinkSuggestions.stem("uien")
    assert_equal "foto", StandardItemLinkSuggestions.stem("foto's")
    assert_equal "appel", StandardItemLinkSuggestions.stem("appels")
    assert_equal "es", StandardItemLinkSuggestions.stem("es")
  end

  test "suggests the same name after a plural ending" do
    assert_equal [ @ui ], suggestions_for(@uien)
  end

  test "suggests a name that is a whole word of the other, both ways" do
    rode_ui = Ingredient.create!(name: "rode ui")
    melk = StandardItem.create!(name: "halfvolle melk")

    assert_includes suggestions_for(@uien), rode_ui
    assert_equal ingredients(:melk), suggestions_for(melk).first
  end

  test "the same stem comes before a name that contains it" do
    Ingredient.create!(name: "rode ui")

    assert_equal @ui, suggestions_for(@uien).first
  end

  test "not part of a word" do
    suiker = StandardItem.create!(name: "suiker")

    assert_not_includes suggestions_for(suiker).to_a, @ui
  end

  test "at most three candidates" do
    %w[ rode\ ui witte\ ui gele\ ui lente\ ui ].each { |name| Ingredient.create!(name: name) }

    assert_equal 3, suggestions_for(@uien).length
  end

  test "skips linked items, items that are an ingredient by name, and rejected pairs" do
    StandardItem.create!(name: "ui")
    prei = StandardItem.create!(name: "preien")
    Ingredient.create!(name: "prei")

    prei.reject_link!(Ingredient.find_by!(name: "prei"))
    prei.reject_link!(Ingredient.find_by!(name: "prei"))

    assert_nil suggestions_for(prei)
    assert_nil suggestions_for(StandardItem.find_by!(name: "ui"))
    @uien.link_to!(@ui)
    assert_nil suggestions_for(@uien)
  end

  test "no query per item" do
    %w[ preien wortels tomaten ].each { |name| StandardItem.create!(name: name) }
    %w[ prei wortel tomaat ].each { |name| Ingredient.create!(name: name) }

    queries = count_queries { StandardItemLinkSuggestions.call }

    assert_operator queries, :<=, 4
  end
end
