# Scaling and rounding amounts, the same way as the frontend (src/utils/quantity.js), so
# the shopping list gets exactly what the recipe page shows. nil means "naar smaak": it
# never scales.
module Quantity
  # The smallest amount we write down when something is needed: never round to 0.
  MINIMUM = { "g" => BigDecimal("0.1"), "ml" => BigDecimal("0.1"), "stuks" => BigDecimal("0.5") }.freeze
  FALLBACK_MINIMUM = BigDecimal("0.01")

  module_function

  def scale(quantity, factor, unit)
    return if quantity.nil?

    round(quantity * factor, unit)
  end

  # g/ml: whole numbers from 10 up, one decimal below that. stuks: halves (half an egg,
  # not a quarter). BigDecimal rounds half up, like Math.round for these positive amounts.
  # BigDecimal(...) around a whole number: round without decimals gives an Integer, and
  # 3 / 2 would then be 1.
  def round(value, unit)
    rounded =
      case unit
      when "g", "ml" then value >= 10 ? BigDecimal(value.round) : value.round(1)
      when "stuks" then BigDecimal((value * 2).round) / 2
      else value.round(2)
      end

    [ rounded, MINIMUM.fetch(unit, FALLBACK_MINIMUM) ].max
  end
end
