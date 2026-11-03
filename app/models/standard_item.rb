# Something you buy often (milk, bread), kept on the server so every device sees the same list.
#
# Temporary ("Tijdelijk" on the standard list): an item typed loose on the shopping list that
# was not on the standard list yet (note_used!). temporary_last_used_at is when it last went
# on the shopping list; nil = a permanent item. Not a category: the heading is always the
# last section, and a category with that name is not allowed. Unused for
# TEMPORARY_LIFETIME, it is removed (remove_expired!). Giving it a category makes it permanent.
class StandardItem < ApplicationRecord
  MAX_LENGTH = 100
  # The heading of the temporary items; a category with this name would look like it.
  TEMPORARY_NAME = "Tijdelijk"
  TEMPORARY_LIFETIME = 2.months

  before_validation :normalize_fields
  # A category makes a temporary item permanent (moved with the edit form).
  before_save :make_permanent, if: -> { category.present? }

  validates :name, presence: true, length: { maximum: MAX_LENGTH }, uniqueness: true
  validates :category, length: { maximum: MAX_LENGTH }
  validate :category_not_reserved

  scope :temporary, -> { where.not(temporary_last_used_at: nil) }
  scope :expired, ->(now = Time.current) { temporary.where(temporary_last_used_at: ...now - TEMPORARY_LIFETIME) }

  # The same normalisation as normalize_fields: "  Verse   MELK " is "verse melk".
  def self.normalize_name(name)
    name.to_s.squish.downcase
  end

  # name just went on the shopping list (a loose item, or an item of the standard list).
  # A temporary item: used now. Not on the standard list: a new temporary item.
  # A permanent item stays as it is. add_new: false only touches an existing item (the
  # standard list's own button). Two requests at the same moment: the unique index on
  # name; the savepoint keeps the caller's transaction usable.
  def self.note_used!(name, add_new: true, now: Time.current)
    name = normalize_name(name)
    return if name.blank? || name.length > MAX_LENGTH

    temporary.where(name: name).update_all(temporary_last_used_at: now, updated_at: now)
    return if !add_new || exists?(name: name)

    transaction(requires_new: true) { create!(name: name, temporary_last_used_at: now) }
  rescue ActiveRecord::RecordNotUnique
    nil
  end

  # Unused temporary items go: when the standard list (or the offline snapshot) is fetched,
  # so no scheduled job is needed. One DELETE.
  def self.remove_expired!(now = Time.current)
    expired(now).delete_all
  end

  # As the API sends it (the standard list and the offline snapshot). temporary_last_used_at:
  # nil for a permanent item; the browser also hides an expired one in its offline copy.
  def self.serialize(item)
    item.slice("id", "name", "category", "temporary_last_used_at")
  end

  def temporary?
    temporary_last_used_at.present?
  end

  # false makes the item permanent: "Geen categorie" in the edit form of a temporary item.
  # true changes nothing (only note_used! makes an item temporary).
  def temporary=(value)
    self.temporary_last_used_at = nil if ActiveModel::Type::Boolean.new.cast(value) == false
  end

  private
    # "  Verse   MELK " and "verse melk" are the same item. An empty category becomes nil.
    def normalize_fields
      self.name = self.class.normalize_name(name)
      self.category = category.to_s.squish.downcase.presence
    end

    def make_permanent
      self.temporary_last_used_at = nil
    end

    def category_not_reserved
      errors.add(:category, :reserved, name: TEMPORARY_NAME) if category.to_s.casecmp?(TEMPORARY_NAME)
    end
end
