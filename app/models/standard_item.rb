# Something you buy often (milk, bread), kept on the server so every device sees the same list.
#
# Temporary ("Tijdelijk" on the standard list): an item typed loose on the shopping list that
# was not on the standard list yet (note_used!). temporary_last_used_at is when it last went
# on the shopping list; nil = a permanent item. Not a category: the heading is always the
# last section, and a category with that name is not allowed. Unused for
# TEMPORARY_LIFETIME, it is removed (remove_expired!). Giving it a category makes it permanent.
#
# ingredient: linked by hand ("ja, hetzelfde") when the item has another name than the
# ingredient ("uien" is "ui"), so the house and "✓ op lijst" know it. Without a link the
# name counts, as before. Suggestions: StandardItemLinkSuggestions.
class StandardItem < ApplicationRecord
  MAX_LENGTH = 100
  # The heading of the temporary items; a category with this name would look like it.
  TEMPORARY_NAME = "Tijdelijk"
  TEMPORARY_LIFETIME = 2.months

  belongs_to :ingredient, optional: true
  # Deleted with the item by the foreign key (on_delete: :cascade).
  has_many :link_rejections, class_name: "StandardItemLinkRejection", dependent: nil

  before_validation :normalize_fields
  # A category makes a temporary item permanent (moved with the edit form).
  before_save :make_permanent, if: -> { category.present? }

  validates :name, presence: true, length: { maximum: MAX_LENGTH }, uniqueness: true
  validates :category, length: { maximum: MAX_LENGTH }
  validate :category_not_reserved
  # belongs_to optional skips the existence check; without this an unknown id hits the
  # foreign key and becomes a 500 instead of a 422.
  validates :ingredient, presence: true, if: -> { ingredient_id.present? }

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
  # ingredient_id: nil when not linked (the browser then matches on name).
  def self.serialize(item)
    item.slice("id", "name", "category", "temporary_last_used_at", "ingredient_id")
  end

  # "Ja, hetzelfde": from now on this item is ingredient. Open shopping list lines with the
  # item's name and no ingredient get it too, so ticking them off puts it in the house.
  # Lines already ticked off are left alone: their stock was settled when they were ticked.
  def link_to!(ingredient)
    transaction do
      update!(ingredient: ingredient)
      ShoppingListItem.unchecked.where(name: name, ingredient_id: nil)
        .update_all(ingredient_id: ingredient.id, updated_at: Time.current)
    end
  end

  # Not the same after all. Shopping list lines keep what they have.
  def unlink!
    update!(ingredient: nil)
  end

  # "Nee, niet hetzelfde": not suggested again. Twice is fine (the unique index).
  def reject_link!(ingredient)
    link_rejections.find_or_create_by!(ingredient: ingredient)
  rescue ActiveRecord::RecordNotUnique
    nil
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
