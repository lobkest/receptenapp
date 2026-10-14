# "1,5" from a Dutch keyboard means 1.5. Only the comma changes, before Rails casts the
# string to a decimal, so "abc" or "1,2,3" still fail a numericality validation instead
# of quietly becoming 0. Empty stays empty: nil.
#
#   class RecipeIngredient < ApplicationRecord
#     include DecimalComma
#     decimal_comma :quantity
#   end
module DecimalComma
  extend ActiveSupport::Concern

  class_methods do
    def decimal_comma(*attributes)
      attributes.each do |attribute|
        define_method(:"#{attribute}=") do |value|
          super(value.is_a?(String) ? value.strip.tr(",", ".") : value)
        end
      end
    end
  end
end
