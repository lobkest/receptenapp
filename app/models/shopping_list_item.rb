# One line on the shared shopping list. There is only one list, so there is no list model:
# every row belongs to it. Anyone with the link can read and change it.
# Lines are never merged: adding "bloem" twice gives two lines, each with its own source.
class ShoppingListItem < ApplicationRecord
  include HasQuantity

  MAX_LENGTH = 100
  MAX_SOURCE_LENGTH = 255

  # Optional: items from the standard list (or any POST without recipe_id) have no recipe, and
  # deleting a recipe sets recipe_id to NULL (foreign key with on_delete: :nullify).
  belongs_to :recipe, optional: true
  # The ingredient, so ticking the line off puts it in the house (PantryItem). Set by "op
  # lijst" from a recipe; a line typed by hand or from the standard list gets the
  # ingredient with the same name, if there is one. Not sent by the browser.
  belongs_to :ingredient, optional: true

  before_validation :normalize_fields
  before_validation :link_ingredient_by_name, if: :link_by_name?
  before_update :update_pantry, if: :will_save_change_to_checked?

  validates :name, presence: true, length: { maximum: MAX_LENGTH }
  # A plain inclusion check, as before: no enum methods needed on a shopping list line.
  has_quantity unit_inclusion: true
  validates :source_label, length: { maximum: MAX_SOURCE_LENGTH }
  # belongs_to optional skips the existence check; without this an unknown id hits the
  # foreign key and becomes a 500 instead of a 422.
  validates :recipe, presence: true, if: -> { recipe_id.present? }

  # The lines for "op lijst": rows of [ name, quantity, unit, ingredient_id ] scaled by factor (a
  # Rational, see Quantity.scale), all with the same source. Attributes for create!.
  def self.lines_for(rows, factor:, source_label:, recipe_id:)
    rows.map do |name, quantity, unit, ingredient_id|
      { name: name, quantity: Quantity.scale(quantity, factor, unit), unit: quantity && unit,
        source_label: source_label, recipe_id: recipe_id, ingredient_id: ingredient_id }
    end
  end

  private
    # "  Rode  UI " is stored as "rode ui", like on the standard list. A unit without an
    # amount is cleared by HasQuantity.
    def normalize_fields
      self.name = name.to_s.squish.downcase
      self.unit = unit.presence
      self.source_label = source_label.to_s.squish.presence
    end

    # A new line without an ingredient, or a renamed one. Not when ticking it off changed
    # the stock: unticking must undo that for the same ingredient.
    def link_by_name?
      new_record? ? ingredient_id.nil? : will_save_change_to_name? && !pantry_changed
    end

    def link_ingredient_by_name
      self.ingredient = Ingredient.find_by(name: name)
    end

    # Ticked off: bought, so in the house. pantry_changed remembers whether that changed
    # the stock; only then does unticking take it out again. Something that was already in
    # the house stays there. Here and not in the browser, so a tick made offline and sent
    # later does the same.
    def update_pantry
      return if ingredient.nil?

      if checked
        self.pantry_changed = PantryItem.set!(ingredient, true)
      elsif pantry_changed
        PantryItem.set!(ingredient, false)
        self.pantry_changed = false
      end
    end
end
