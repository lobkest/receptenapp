# One line on the shared shopping list. There is only one list, so there is no list model:
# every row belongs to it. Anyone with the link can read and change it.
# Lines are never merged: adding "bloem" twice gives two lines, each with its own source.
class ShoppingListItem < ApplicationRecord
  include DecimalComma

  MAX_LENGTH = 100
  MAX_SOURCE_LENGTH = 255

  # Optional: items from the standard list or an old browser list have no recipe, and
  # deleting a recipe sets recipe_id to NULL (foreign key with on_delete: :nullify).
  belongs_to :recipe, optional: true

  decimal_comma :quantity

  before_validation :normalize_fields

  validates :name, presence: true, length: { maximum: MAX_LENGTH }
  validates :quantity, numericality: { greater_than: 0, less_than: RecipeIngredient::MAX_QUANTITY }, allow_nil: true
  validates :unit, presence: true, inclusion: { in: RecipeIngredient.units.keys }, if: -> { quantity.present? }
  validates :source_label, length: { maximum: MAX_SOURCE_LENGTH }
  # belongs_to optional skips the existence check; without this an unknown id hits the
  # foreign key and becomes a 500 instead of a 422.
  validates :recipe, presence: true, if: -> { recipe_id.present? }

  private
    # "  Rode  UI " is stored as "rode ui", like on the standard list. Without an
    # amount a unit means nothing ("zout", "wc-papier"), so it is cleared.
    def normalize_fields
      self.name = name.to_s.squish.downcase
      self.unit = nil if quantity.nil?
      self.unit = unit.presence
      self.source_label = source_label.to_s.squish.presence
    end
end
