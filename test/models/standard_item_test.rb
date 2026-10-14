require "test_helper"

class StandardItemTest < ActiveSupport::TestCase
  test "naam en categorie worden genormaliseerd" do
    item = StandardItem.create!(name: "  Verse   BANAAN ", category: " Groente  &  FRUIT ")

    assert_equal "verse banaan", item.name
    assert_equal "groente & fruit", item.category
  end

  test "een lege categorie wordt nil" do
    [ "", "   ", nil ].each do |category|
      item = StandardItem.new(name: "brood", category: category)
      assert item.valid?, category.inspect
      assert_nil item.category, category.inspect
    end
  end

  test "naam is verplicht" do
    item = StandardItem.new(name: "   ")

    assert_not item.valid?
    assert item.errors.added?(:name, :blank)
    assert_includes item.errors.full_messages, "Naam moet opgegeven zijn"
  end

  test "naam is uniek na normaliseren" do
    item = StandardItem.new(name: " MELK ")

    assert_not item.valid?
    assert item.errors.added?(:name, :taken, value: "melk")
    assert_includes item.errors.full_messages, "Naam is al in gebruik"
  end

  test "de database bewaakt de uniekheid ook" do
    assert_raises(ActiveRecord::RecordNotUnique) do
      StandardItem.insert_all!([ { name: "melk" } ])
    end
  end

  test "naam en categorie zijn maximaal 100 tekens" do
    assert_not StandardItem.new(name: "a" * 101).valid?
    assert_not StandardItem.new(name: "kaas2", category: "a" * 101).valid?
  end
end
