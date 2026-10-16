# A category of recipes ("Ontbijt", "Diner"). A recipe has one or none (see
# Recipe#category_name=). Unlike tags, names keep their capitals: "Ontbijt" stays
# "Ontbijt", but "ontbijt" is the same category (unique index on lower(name)).
class Category < ApplicationRecord
  MAX_NAME_LENGTH = 30
  # The heading for recipes without a category; a category with that name would look
  # like a second "Overig" section.
  RESERVED_NAME = "Overig"

  has_many :recipes, dependent: :nullify

  # "  Verse   soep " becomes "Verse soep". Also applied to where(name: ...).
  normalizes :name, with: ->(name) { name.squish }

  validates :name, presence: true, length: { maximum: MAX_NAME_LENGTH },
    uniqueness: { case_sensitive: false }
  validates :position, presence: true, numericality: { only_integer: true }
  validate :name_not_reserved

  scope :ordered, -> { order(:position, :id) }

  # The category with this name in any case ("ontbijt" finds "Ontbijt"), or nil.
  def self.find_named(name)
    name = normalize_value_for(:name, name.to_s)
    where("lower(name) = lower(?)", name).first
  end

  # The existing category, or a new one at the end of the order. Also when another
  # request creates the same name at the same moment (like Tag.named):
  # - the other insert is not committed yet: ours hits the unique index. The savepoint
  #   (requires_new) keeps the recipe's transaction usable, and we look again;
  # - the other insert was just committed: our uniqueness validation sees it (:taken).
  def self.named(name)
    find_named(name) || transaction(requires_new: true) { create!(name: name, position: next_position) }
  rescue ActiveRecord::RecordNotUnique
    find_named(name) || raise
  rescue ActiveRecord::RecordInvalid => error
    raise unless error.record.errors.of_kind?(:name, :taken)

    find_named(name) || raise
  end

  # Two new categories at the same moment may get the same position; ordered then
  # falls back to the id, so the order stays fixed.
  def self.next_position
    maximum(:position).to_i + 1
  end

  private
    def name_not_reserved
      errors.add(:name, :reserved, name: RESERVED_NAME) if name.to_s.casecmp?(RESERVED_NAME)
    end
end
