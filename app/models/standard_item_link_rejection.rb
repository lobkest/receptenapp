# "Nee, niet hetzelfde": this standard item and this ingredient are not the same thing, so
# StandardItemLinkSuggestions does not suggest the pair again. Goes with either side
# (foreign keys with on_delete: :cascade).
class StandardItemLinkRejection < ApplicationRecord
  belongs_to :standard_item
  belongs_to :ingredient

  validates :ingredient_id, uniqueness: { scope: :standard_item_id }
end
