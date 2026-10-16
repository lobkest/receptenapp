require "test_helper"

class TagTest < ActiveSupport::TestCase
  test "naam wordt genormaliseerd: spaties en hoofdletters" do
    assert_equal "snel klaar", Tag.create!(name: "  Snel   KLAAR ").name
  end

  test "find_by normaliseert de naam ook" do
    assert_equal tags(:vega), Tag.find_by(name: " VEGA ")
  end

  test "naam is verplicht, maximaal 30 tekens en zonder komma" do
    assert_not Tag.new(name: "  ").valid?
    assert_not Tag.new(name: "a" * 31).valid?
    assert Tag.new(name: "a" * 30).valid?
    assert_not Tag.new(name: "vega,snel").valid?
  end

  test "naam is uniek na normaliseren" do
    tag = Tag.new(name: "Vega")

    assert_not tag.valid?
    assert_includes tag.errors.full_messages, "Naam is al in gebruik"
  end

  test "de database bewaakt de uniekheid ook" do
    assert_raises(ActiveRecord::RecordNotUnique) { Tag.insert_all!([ { name: "vega" } ]) }
  end

  test "named hergebruikt een bestaande tag en maakt anders een nieuwe" do
    assert_no_difference("Tag.count") { assert_equal tags(:vega), Tag.named("Vega") }
    assert_difference("Tag.count", 1) { assert_equal "hartig", Tag.named("Hartig").name }
  end

  test "named geeft de bestaande tag terug als een andere request hem net aanmaakte" do
    vega = tags(:vega)
    # De eerste find_by ziet de tag (nog) niet, alsof een andere request hem net heeft
    # aangemaakt. (Minitest 6 heeft geen stub meer zonder extra gem, dus tijdelijk zelf.)
    calls = 0
    Tag.define_singleton_method(:find_by) { |*args| (calls += 1) == 1 ? nil : super(*args) }

    assert_no_difference("Tag.count") { assert_equal vega, Tag.named("vega") }
  ensure
    Tag.singleton_class.remove_method(:find_by)
  end

  test "een recept koppelt een tag maar één keer" do
    assert_raises(ActiveRecord::RecordNotUnique) do
      RecipeTag.create!(recipe: recipes(:pannenkoeken), tag: tags(:vega))
    end
  end
end
