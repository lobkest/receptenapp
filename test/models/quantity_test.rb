require "test_helper"

# The same cases as frontend/src/__tests__/quantity.spec.js, from one shared file, so the
# server (shopping list) and the browser (recipe page) always agree on an amount.
class QuantityTest < ActiveSupport::TestCase
  # file_fixture_path is test/fixtures/files; file_fixture itself only works inside a test.
  JSON.parse(File.read(File.join(file_fixture_path, "quantity_cases.json"))).fetch("cases").each do |example|
    quantity, servings, base, unit, expected = example.values_at("quantity", "servings", "base", "unit", "expected")

    test "#{quantity.inspect} #{unit} × #{servings}/#{base} is #{expected.inspect} #{example["note"]}".strip do
      result = Quantity.scale(quantity && BigDecimal(quantity), Rational(servings, base), unit)

      if expected.nil?
        assert_nil result
      else
        assert_equal BigDecimal(expected), result
      end
    end
  end
end
