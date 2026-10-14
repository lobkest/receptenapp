# Something you buy often (milk, bread), kept on the server so every device sees the same list.
class StandardItem < ApplicationRecord
  MAX_LENGTH = 100

  before_validation :normalize_fields

  validates :name, presence: true, length: { maximum: MAX_LENGTH }, uniqueness: true
  validates :category, length: { maximum: MAX_LENGTH }

  private
    # "  Verse   MELK " and "verse melk" are the same item. An empty category becomes nil.
    def normalize_fields
      self.name = name.to_s.squish.downcase
      self.category = category.to_s.squish.downcase.presence
    end
end
