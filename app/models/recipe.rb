class Recipe < ApplicationRecord
  enum :status, { pending: "pending", approved: "approved", rejected: "rejected" }, default: :pending, validate: true

  validates :title, presence: true, length: { maximum: 150 }
  validates :servings, numericality: { only_integer: true, greater_than: 0 }
end
