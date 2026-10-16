require "test_helper"

class Importers::StandardItemsTest < ActiveSupport::TestCase
  ROWS = [
    { "name" => "Tomaten", "category" => "Groente & fruit" },
    { "name" => "Feta", "category" => "Zuivel" },
    { "name" => "  MELK ", "category" => "Zuivel" }
  ].freeze

  test "maakt nieuwe items aan en slaat bestaande namen over, ongeacht hoofdletters en spaties" do
    report = Importers::StandardItems.call(ROWS)

    assert_equal [ "tomaten — groente & fruit", "feta — zuivel" ], report.created.map(&:label)
    assert_equal [ [ 3, "melk", "bestaat al" ] ], report.skipped.map { |entry| [ entry.line, entry.label, entry.reason ] }
    assert_equal "groente & fruit", StandardItem.find_by!(name: "tomaten").category
  end

  test "twee keer importeren maakt niets dubbel" do
    Importers::StandardItems.call(ROWS)

    assert_no_difference "StandardItem.count" do
      report = Importers::StandardItems.call(ROWS)
      assert_empty report.created
      assert_equal 3, report.skipped.size
    end
  end

  test "hergebruikt een bestaande categorie en meldt alleen nieuwe" do
    report = Importers::StandardItems.call(ROWS + [ { "name" => "Appels", "category" => "groente & FRUIT" } ])

    assert_equal [ "groente & fruit" ], report.new_categories
    assert_equal "zuivel", StandardItem.find_by!(name: "feta").category
  end

  test "dry-run schrijft niets weg maar rapporteert wel" do
    report = assert_no_difference("StandardItem.count") { Importers::StandardItems.call(ROWS, dry_run: true) }

    assert report.dry_run?
    assert_equal 2, report.created.size
    assert_includes report.to_s, "DRY RUN"
  end

  test "een ongeldig item wordt overgeslagen en gemeld, de rest gaat door" do
    rows = [ { "name" => "" }, { "name" => "x" * 101 }, { "name" => "Kiwi", "kleur" => "groen" }, "brood", { "name" => "Bananen" } ]
    report = Importers::StandardItems.call(rows)

    assert_equal [ "bananen" ], report.created.map(&:label)
    assert_equal [ 1, 2, 3, 4 ], report.failed.map(&:line)
    assert_includes report.failed.first.reason, "Naam moet opgegeven zijn"
    assert_includes report.failed[2].reason, "onbekende velden kleur"
  end
end
