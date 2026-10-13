class Ingredient < ApplicationRecord
  MAX_NAME_LENGTH = 100

  # An ingredient still used by a recipe cannot be deleted.
  has_many :recipe_ingredients, dependent: :restrict_with_error

  # "  Verse   BASILICUM " and "verse basilicum" are the same ingredient.
  normalizes :name, with: ->(name) { name.squish.downcase }

  validates :name, presence: true, length: { maximum: MAX_NAME_LENGTH }, uniqueness: true
end
