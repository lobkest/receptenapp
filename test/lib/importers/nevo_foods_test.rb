require "test_helper"

class Importers::NevoFoodsTest < ActiveSupport::TestCase
  FILE = Rails.root.join("test/fixtures/files/nevo_mini.csv").to_s

  def write_csv(content)
    file = Tempfile.new([ "nevo", ".csv" ])
    file.write(content)
    file.close
    file.path
  end

  test "imports every product with only the chosen nutrients, decimal commas and empty values" do
    result = assert_difference("NevoFood.count", 4) { Importers::NevoFoods.from_file(FILE) }
    assert_equal 4, result.created
    assert_equal 0, result.updated
    assert_equal [ "NEVO-Online 2025 9.0" ], result.versions

    beet = NevoFood.find_by!(code: 9101)
    assert_equal "Testbiet rauw", beet.name
    assert_equal "Bieten test rauw", beet.synonym
    assert_equal "g", beet.unit
    assert_equal [ 43, BigDecimal("1.6"), BigDecimal("7.2"), BigDecimal("0.1"), BigDecimal("2.8") ],
      beet.values_at(:kcal, :protein, :carbohydrates, :fat, :fiber)

    # An empty field, with or without quotes, is unknown: nil, never 0.
    assert_nil NevoFood.find_by!(code: 9102).fiber
    assert_nil NevoFood.find_by!(code: 9104).fiber
    assert_equal 0, NevoFood.find_by!(code: 9103).fiber
    # No synonym: nil, and the name is shown instead.
    assert_nil NevoFood.find_by!(code: 9104).synonym
    assert_equal "ml", NevoFood.find_by!(code: 9104).unit
  end

  test "running it twice gives no doubles, updates the values and keeps the links" do
    Importers::NevoFoods.from_file(FILE)
    beet = NevoFood.find_by!(code: 9101)
    ingredients(:zout).update!(nevo_food: beet)
    beet.update_columns(kcal: 1, version: "oud")

    result = assert_no_difference("NevoFood.count") { Importers::NevoFoods.from_file(FILE) }
    assert_equal 0, result.created
    assert_equal 4, result.updated
    assert_equal 43, beet.reload.kcal
    assert_equal "NEVO-Online 2025 9.0", beet.version
    assert_equal beet, ingredients(:zout).reload.nevo_food
  end

  test "a file without the expected columns changes nothing" do
    path = write_csv("\"NEVO-code\"|\"Voedingsmiddelnaam/Dutch food name\"\r\n1|Test\r\n")

    error = assert_raises(Importers::NevoFoods::InvalidFile) { Importers::NevoFoods.from_file(path) }
    assert_includes error.message, "ENERCC (kcal)"
    assert_equal 0, NevoFood.where(code: 1).count
  end

  test "a bad number or unit stops the whole import, with the line" do
    lines = File.read(FILE).lines
    bad_number = lines[0] + lines[1] + lines[2].sub('"140"', '"1.40"')

    error = assert_raises(Importers::NevoFoods::InvalidFile) { Importers::NevoFoods.from_file(write_csv(bad_number)) }
    assert_equal 'regel 3: ongeldig getal "1.40"', error.message
    # Line 2 was fine, but nothing is written.
    assert_nil NevoFood.find_by(code: 9101)

    bad_unit = lines[0] + lines[1].sub("per 100g", "per stuk")
    error = assert_raises(Importers::NevoFoods::InvalidFile) { Importers::NevoFoods.from_file(write_csv(bad_unit)) }
    assert_equal 'regel 2: onbekende hoeveelheid "per stuk"', error.message
  end
end
