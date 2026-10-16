# A label on a recipe ("vega", "snel"). Shared between recipes; see Recipe#tag_names=.
#
# A tag that excludes traits (tag_exclusions: vegetarisch excludes vlees and vis) is
# automatic: RecipeTagEvaluator works it out from the ingredients, and nobody sets it by
# hand. The other tags are set by hand (recipe_tags).
class Tag < ApplicationRecord
  MAX_NAME_LENGTH = 30

  has_many :recipe_tags, dependent: :destroy
  has_many :recipes, through: :recipe_tags
  has_many :tag_exclusions, dependent: :delete_all
  has_many :excluded_traits, through: :tag_exclusions, source: :trait

  scope :automatic, -> { where(id: TagExclusion.select(:tag_id)) }
  scope :manual, -> { where.not(id: TagExclusion.select(:tag_id)) }

  def self.automatic_names
    automatic.pluck(:name)
  end

  # "  Snel  KLAAR " and "snel klaar" are the same tag. Also applied to find_by(name: ...).
  normalizes :name, with: ->(name) { name.squish.downcase }

  # No comma: the filter sends several tags as ?tags=vega,snel.
  validates :name, presence: true, length: { maximum: MAX_NAME_LENGTH },
    format: { without: /,/ }, uniqueness: true

  # The existing tag, or a new one, also when another request creates the same tag at the
  # same moment. Two ways that can show up:
  # - the other insert is not committed yet: ours hits the unique index; create_or_find_by!
  #   (in a savepoint, so the recipe's transaction survives) then returns the existing row;
  # - the other insert was just committed: our uniqueness validation sees it (:taken).
  def self.named(name)
    find_by(name: name) || create_or_find_by!(name: name)
  rescue ActiveRecord::RecordInvalid => error
    raise unless error.record.errors.of_kind?(:name, :taken)

    find_by!(name: name)
  end
end
