# An amount with a unit, for RecipeIngredient, VariationChange (an added ingredient) and
# ShoppingListItem: "1,5" becomes 1.5, a unit without an amount is cleared ("zout — naar
# smaak"), the amount is positive and an amount needs a unit. The database has the same
# rules as check constraints (*_quantity_positive, *_unit_known, *_quantity_has_unit).
#
#   class RecipeIngredient < ApplicationRecord
#     include HasQuantity
#     unit_enum
#     has_quantity
#   end
#
#   class VariationChange < ApplicationRecord
#     include HasQuantity
#     unit_enum
#     has_quantity if: :kind_add?   # a removal has no amount of its own
#   end
#
# unit_enum and has_quantity are two macros, so each model keeps its validations in the
# same order as before (the order of the error messages in the API).
#
# Why a concern and not a validator: a validator only checks. This also changes the input
# before validation ("1,5", clearing the unit), which is model behaviour, not a check.
module HasQuantity
  extend ActiveSupport::Concern
  include DecimalComma

  # The same units as the frontend (UNITS in src/utils/quantity.js).
  UNITS = %w[ g ml stuks ].freeze
  MAX_QUANTITY = 100_000

  class_methods do
    # unit as an enum: unit_g?, and an unknown unit is a validation error, not an exception.
    # prefix: unit_g? instead of g?, and no scope called RecipeIngredient.g.
    def unit_enum
      enum :unit, UNITS.index_by(&:itself), prefix: true, validate: { allow_nil: true }
    end

    # if: only for some rows (a method name). unit_inclusion: a plain check of the unit,
    # for a model without unit_enum (ShoppingListItem).
    def has_quantity(if: nil, unit_inclusion: false)
      condition = binding.local_variable_get(:if)
      with_amount = [ condition, -> { quantity.present? } ].compact

      # "1,5" → 1.5 (see DecimalComma). Empty stays nil: "naar smaak".
      decimal_comma :quantity

      before_validation :clear_unit_without_quantity, if: condition

      validates :quantity, numericality: { greater_than: 0, less_than: MAX_QUANTITY }, allow_nil: true, if: condition
      validates :unit, presence: true, if: with_amount
      validates :unit, inclusion: { in: UNITS }, if: with_amount if unit_inclusion
    end
  end

  private
    # A unit means nothing without an amount ("zout — naar smaak").
    def clear_unit_without_quantity
      self.unit = nil if quantity.nil?
    end
end
