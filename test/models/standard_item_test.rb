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

  # Tijdelijk (temporary_last_used_at)

  test "note_used! zet een nieuwe naam onder Tijdelijk, met nu als laatst gebruikt" do
    freeze_time do
      item = StandardItem.note_used!("  Verse  BASILICUM ")

      assert_equal "verse basilicum", item.name
      assert item.temporary?
      assert_nil item.category
      assert_equal Time.current, item.temporary_last_used_at
    end
  end

  test "note_used! laat een permanent item met dezelfde naam staan" do
    melk = standard_items(:melk)

    assert_no_difference("StandardItem.count") { StandardItem.note_used!(" MELK ") }
    assert_not melk.reload.temporary?
  end

  test "note_used! werkt het tijdstip van een tijdelijk item bij, zonder een tweede" do
    item = travel_to(Time.zone.local(2026, 9, 1, 12)) { StandardItem.note_used!("dille") }

    travel_to(Time.zone.local(2026, 10, 1, 12)) do
      assert_no_difference("StandardItem.count") { StandardItem.note_used!("Dille") }
      assert_equal Time.current, item.reload.temporary_last_used_at
    end
  end

  test "note_used! met add_new: false maakt niets aan" do
    assert_no_difference("StandardItem.count") { StandardItem.note_used!("dille", add_new: false) }
  end

  test "remove_expired! verwijdert alleen tijdelijke items die 2 maanden niet gebruikt zijn" do
    old = travel_to(Time.zone.local(2026, 9, 1, 12)) { StandardItem.note_used!("dille") }
    recent = travel_to(Time.zone.local(2026, 9, 2, 12)) { StandardItem.note_used!("bieslook") }
    old_permanent = standard_items(:melk)
    old_permanent.update_columns(updated_at: Time.zone.local(2020, 1, 1))

    travel_to(Time.zone.local(2026, 11, 1, 12, 0, 1)) { StandardItem.remove_expired! }

    assert_not StandardItem.exists?(old.id)
    assert StandardItem.exists?(recent.id)
    assert StandardItem.exists?(old_permanent.id)
  end

  test "op precies 2 maanden is een tijdelijk item nog niet verlopen" do
    item = travel_to(Time.zone.local(2026, 9, 1, 12)) { StandardItem.note_used!("dille") }

    travel_to(Time.zone.local(2026, 11, 1, 12)) { StandardItem.remove_expired! }

    assert StandardItem.exists?(item.id)
  end

  test "een categorie maakt een tijdelijk item permanent: het verloopt nooit" do
    item = travel_to(Time.zone.local(2026, 1, 1)) { StandardItem.note_used!("dille") }

    item.update!(category: "kruiden")
    travel_to(Time.zone.local(2027, 1, 1)) { StandardItem.remove_expired! }

    assert_not item.reload.temporary?
    assert StandardItem.exists?(item.id)
  end

  test "temporary: false maakt permanent zonder categorie, true verandert niets" do
    item = StandardItem.note_used!("dille")

    item.update!(temporary: true)
    assert item.reload.temporary?

    item.update!(temporary: false)
    assert_not item.reload.temporary?
    assert_nil item.category
  end

  test "de categorie Tijdelijk is niet toegestaan, in elke schrijfwijze" do
    [ "Tijdelijk", " TIJDELIJK " ].each do |category|
      item = StandardItem.new(name: "dille", category: category)

      assert_not item.valid?, category.inspect
      assert item.errors.added?(:category, :reserved, name: "Tijdelijk")
      assert_includes item.errors.full_messages, 'Categorie kan niet "Tijdelijk" zijn, die naam is gereserveerd'
    end
  end
end
