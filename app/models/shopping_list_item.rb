# One line on the shared shopping list. There is only one list, so there is no list model:
# every row belongs to it. Anyone with the link can read and change it.
# Lines are never merged: adding "bloem" twice gives two lines, each with its own source.
# The one exception is the standard list: tapping an item that is already on the list adds
# one to count of an existing line, see add_standard!; remove_standard! takes that part off.
#
# count: how many you want, 1 to 99, set with the stepper on the shopping list. A multiplier:
# "100 g yoghurt" with count 2 is 200 g. standard_count: how many times it was tapped on the
# standard list; only > 0 matters (the line has a standard part, see remove_recipe_part!).
class ShoppingListItem < ApplicationRecord
  include HasQuantity

  MAX_LENGTH = 100
  MAX_SOURCE_LENGTH = 255
  MAX_COUNT = 99
  # source_label of a line that only came from the standard list (no recipe, no quantity).
  STANDARD_SOURCE = "standaard"
  # source_label of a line typed on the shopping list itself ("3 uien"), see add_loose!.
  LOOSE_SOURCE = "los"

  # Optional: items from the standard list (or any POST without recipe_id) have no recipe, and
  # deleting a recipe sets recipe_id to NULL (foreign key with on_delete: :nullify).
  belongs_to :recipe, optional: true
  # The ingredient, so ticking the line off puts it in the house (PantryItem). Set by "op
  # lijst" from a recipe; a line typed by hand or from the standard list gets the
  # ingredient with the same name, if there is one, or the ingredient the standard item
  # with that name is linked to. Not sent by the browser.
  belongs_to :ingredient, optional: true

  before_validation :normalize_fields
  before_validation :count_standard_line, on: :create
  before_validation :link_ingredient_by_name, if: :link_by_name?
  before_update :update_pantry, if: :will_save_change_to_checked?

  validates :name, presence: true, length: { maximum: MAX_LENGTH }
  # A plain inclusion check, as before: no enum methods needed on a shopping list line.
  has_quantity unit_inclusion: true
  validates :source_label, length: { maximum: MAX_SOURCE_LENGTH }
  validates :count, numericality: { only_integer: true, greater_than_or_equal_to: 1, less_than_or_equal_to: MAX_COUNT }
  validates :standard_count, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
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

  # Not ticked off yet. Only these count as "on the list".
  scope :unchecked, -> { where(checked: false) }

  # One tap on the standard list for name. Already on the list (an open line with the same
  # name, whatever its source): one more on an existing line (count, up to MAX_COUNT),
  # preferring a line that only came from the standard list, otherwise the oldest. Not on
  # the list: a new standard line.
  # Matches on name, like the browser does, and also on the ingredient when the standard
  # item is linked to one ("uien" is the ingredient "ui": an open "ui" from a recipe gets
  # one more). Returns the line. A temporary standard item is used again
  # (StandardItem.note_used!).
  def self.add_standard!(name)
    name = name.to_s.squish.downcase
    StandardItem.note_used!(name, add_new: false)
    matching = open_lines_for_standard(name).to_a
    line = matching.find(&:standard_only?) || matching.first
    return create!(name: name, source_label: STANDARD_SOURCE, standard_count: 1) if line.nil?

    line.update!(count: [ line.count + 1, MAX_COUNT ].min, standard_count: line.standard_count + 1)
    line
  end

  # "✓ op lijst" on the standard list: takes the standard part off the open lines that
  # add_standard! would match. A line only from the standard list is removed; a line from a
  # recipe (or typed by hand) that the standard list counted on gets standard_count 0 and
  # that many less on count (never below 1), so it is as before the taps. Lines without a
  # standard part stay as they are. Running it twice changes nothing the second time.
  # Returns [ ids of the removed lines, the lines that were changed ].
  def self.remove_standard!(name)
    lines = open_lines_for_standard(name.to_s.squish.downcase).lock
    transaction do
      removed, kept = lines.select { |line| line.standard_only? || line.standard_count.positive? }
                           .partition(&:standard_only?)
      removed.each(&:destroy!)
      kept.each { |line| line.update!(standard_count: 0, count: [ line.count - line.standard_count, 1 ].max) }
      [ removed.map(&:id), kept ]
    end
  end

  # The open lines for the standard item name, oldest first: the same name, or the
  # ingredient the standard item is linked to ("uien" is "ui").
  def self.open_lines_for_standard(name)
    ingredient_id = StandardItem.where(name: name).pick(:ingredient_id)
    lines = unchecked.where(name: name)
    lines = lines.or(unchecked.where(ingredient_id: ingredient_id)) if ingredient_id
    lines.order(:id)
  end
  private_class_method :open_lines_for_standard

  # A loose item typed on the shopping list: "uien" count times. ingredient: the suggestion
  # that was picked, or nil for free text (name as typed; no new ingredient is made, but a
  # name that happens to be an ingredient is linked, like any line). Already on the list as
  # an open line without an amount for the same ingredient (or, free text, the same name):
  # count more on that line, so "uien" twice is "uien ×2". Otherwise a new loose line.
  # checked: ticked off offline before it was ever sent; then always its own line, ticked
  # off (an update, so it goes in the house like any tick). Returns the line.
  # Also on the standard list, under "Tijdelijk" (StandardItem.note_used!): here, and not in
  # the browser, so a loose item added offline gets there when the outbox is sent. In one
  # transaction: an invalid line (count 0) adds nothing to the standard list either.
  def self.add_loose!(name:, ingredient: nil, count: 1, checked: false)
    count = Integer(count.to_s, exception: false) || 0
    name = ingredient&.name || name.to_s.squish.downcase
    transaction do
      add_loose_line!(name, ingredient, count, checked).tap { StandardItem.note_used!(name) }
    end
  end

  def self.add_loose_line!(name, ingredient, count, checked)
    unless checked
      matching = unchecked.where(quantity: nil).where(ingredient ? { ingredient: ingredient } : { name: name })
      line = matching.order(:id).first
      if line && count.between?(1, MAX_COUNT)
        line.update!(count: [ line.count + count, MAX_COUNT ].min)
        return line
      end
    end

    line = create!(name: name, ingredient: ingredient, count: count, source_label: LOOSE_SOURCE)
    line.update!(checked: true) if checked
    line
  end
  private_class_method :add_loose_line!

  # Only from the standard list: no recipe part (and so no quantity).
  def standard_only?
    recipe_id.nil? && source_label == STANDARD_SOURCE
  end

  # "Verwijder" in "Recepten op je lijst": remove_recipe_part! on every open line of one
  # recipe, all or none. The recipe by recipe_id, or, after it was deleted (recipe_id is then
  # NULL), by the source_label its lines kept. Ticked-off lines stay.
  # Returns [ ids of the removed lines, the lines that stayed as standard lines ].
  def self.remove_recipe!(recipe_id: nil, source_label: nil)
    lines = recipe_id ? unchecked.where(recipe_id: recipe_id) : of_deleted_recipe(source_label).unchecked
    transaction do
      results = lines.order(:id).lock.map { |line| [ line.id, line.remove_recipe_part! ] }
      removed, kept = results.partition { |_id, line| line.nil? }
      [ removed.map(&:first), kept.map(&:last) ]
    end
  end

  # The lines of a recipe that is gone: no recipe_id any more, but the recipe's source_label.
  def self.of_deleted_recipe(source_label)
    where(recipe_id: nil, source_label: source_label.to_s.squish).where.not(source_label: [ STANDARD_SOURCE, LOOSE_SOURCE ])
  end

  # "✓ op lijst" on a recipe takes the recipe part off. Was the line also added from the
  # standard list, it stays as a standard line with one less (the recipe counted once, but
  # never below 1); otherwise it is removed (returns nil).
  def remove_recipe_part!
    return destroy_line if standard_count.zero?

    update!(recipe: nil, quantity: nil, unit: nil, source_label: STANDARD_SOURCE, count: [ count - 1, 1 ].max)
    self
  end

  private
    # Removed: there is no line left to send back.
    def destroy_line
      destroy!
      nil
    end

    # "  Rode  UI " is stored as "rode ui", like on the standard list. A unit without an
    # amount is cleared by HasQuantity.
    def normalize_fields
      self.name = name.to_s.squish.downcase
      self.unit = unit.presence
      self.source_label = source_label.to_s.squish.presence
    end

    # A new standard line counts once, also when the request does not say so (an older
    # version of the app, still open on a phone, posts the line without standard_count).
    def count_standard_line
      self.standard_count = 1 if standard_only? && standard_count.to_i.zero?
    end

    # A new line without an ingredient, or a renamed one. Not when ticking it off changed
    # the stock: unticking must undo that for the same ingredient.
    def link_by_name?
      new_record? ? ingredient_id.nil? : will_save_change_to_name? && !pantry_changed
    end

    # The ingredient with this name, or else the one the standard item with this name is
    # linked to ("uien" → "ui", StandardItem#link_to!).
    def link_ingredient_by_name
      self.ingredient = Ingredient.find_by(name: name) || StandardItem.find_by(name: name)&.ingredient
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
