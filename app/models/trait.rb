# A property of an ingredient that a tag can exclude: vlees, vis, dierlijk, gluten,
# lactose, noten (see migrations AddAutomaticTags and AddNutsTag). Kip has vlees and
# dierlijk; vegetarisch excludes vlees and vis. RecipeTagEvaluator works out the automatic tags from these.
class Trait < ApplicationRecord
  has_many :ingredient_traits, dependent: :delete_all
  has_many :tag_exclusions, dependent: :delete_all

  normalizes :name, with: ->(name) { name.squish.downcase }

  validates :name, presence: true, uniqueness: true

  # The order of the chips on the ingredients page; a trait added later comes after these.
  ORDER = %w[ vlees vis dierlijk gluten lactose noten ].freeze

  scope :ordered, -> { in_order_of(:name, ORDER, filter: false).order(:name) }

  def self.sort(traits)
    traits.sort_by { |trait| [ ORDER.index(trait.name) || ORDER.size, trait.name ] }
  end
end
