class Recipe < ApplicationRecord
  validates :title, presence: true, length: { maximum: 150 }
  validates :servings, numericality: { only_integer: true, greater_than: 0 }
end
