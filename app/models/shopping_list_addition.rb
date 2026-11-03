# "Op lijst" for a recipe or a variation: checks what the browser asks for, lets the
# source say which lines it needs (scaled with Quantity), and stores them all or none.
# Not a table: a form object. ActiveModel::Model gives it validations and errors like
# a model, so the controller handles it the same way (render_invalid).
#
#   addition = ShoppingListAddition.new(source: recipe, servings: 6, ingredient_ids: [ 12 ])
#   addition.save  # => true, addition.items are the new ShoppingListItems
class ShoppingListAddition
  include ActiveModel::Model

  # source: a Recipe or a RecipeVariation; both answer #shopping_list_items.
  # servings: as sent ("6", 6 or "veel"), or nil for the recipe's own number; the
  # validation below says what is wrong with it.
  # ingredient_ids: rows of the recipe, or nil for everything except the optional ones.
  # alternative_ids: the alternatives swapped in on the recipe page, at most one per row
  # (RecipeIngredientAlternative ids; the row follows from the alternative).
  # skip_ingredient_ids: rows of the recipe to leave out, because they are in the house
  # ("Alles op lijst" and "Variatie op lijst"). skip_addition_ids: the same for the
  # ingredients a variation adds (VariationChange ids). Unknown ids are ignored.
  # skip_in_house: true leaves out what is in the house now, worked out here instead of by
  # the browser. For a change made offline and sent later: the stock of that moment counts,
  # like "Alles op lijst" online would see it. Comes on top of the skip ids.
  attr_accessor :source, :ingredient_ids, :alternative_ids, :skip_ingredient_ids, :skip_addition_ids, :skip_in_house
  attr_writer :servings
  attr_reader :items

  validates :servings, numericality: { only_integer: true, greater_than: 0, less_than_or_equal_to: Recipe::MAX_SERVINGS }
  validate :ingredients_of_this_recipe, unless: -> { ingredient_ids.nil? }
  validate :alternatives_of_this_recipe, unless: -> { alternative_ids.nil? }

  def save
    return false if invalid?

    lines = source.shopping_list_items(servings: Integer(servings.to_s), only: chosen_ids, swaps: swaps, **skips)
    @items = ShoppingListItem.transaction { lines.map { |attributes| ShoppingListItem.create!(attributes) } }
    true
  end

  # For ClientAction.once: an invalid addition raises, so nothing is remembered.
  def save!
    save || raise(ActiveModel::ValidationError, self)
  end

  def servings
    @servings.nil? ? recipe.servings : @servings
  end

  private
    def recipe
      source.is_a?(Recipe) ? source : source.recipe
    end

    def chosen_ids
      ingredient_ids && Array.wrap(ingredient_ids).map { |id| Integer(id.to_s, exception: false) }
    end

    def chosen_alternative_ids
      integers(alternative_ids)
    end

    # Only a variation adds ingredients of its own.
    def skips
      skips = { skip: integers(skip_ingredient_ids) + in_house_row_ids }
      skips[:skip_additions] = integers(skip_addition_ids) + in_house_addition_ids if source.is_a?(RecipeVariation)
      skips
    end

    def present_ids
      @present_ids ||= skip_in_house ? PantryItem.present_ingredient_ids : Set.new
    end

    # The rows whose ingredient is in the house, after swapping: like the house on the
    # recipe page, which shows the alternative when it is swapped in.
    def in_house_row_ids
      return [] if present_ids.empty?

      recipe.recipe_ingredients.select { |row| present_ids.include?((swaps[row.id] || row).ingredient_id) }.map(&:id)
    end

    # A variation's additions have a name, not an ingredient: matched by name, like the browser.
    def in_house_addition_ids
      return [] if present_ids.empty?

      additions = source.additions
      present_names = Ingredient.where(id: present_ids.to_a, name: additions.map(&:name)).pluck(:name)
      additions.select { |addition| present_names.include?(addition.name) }.map(&:id)
    end

    def integers(ids)
      Array.wrap(ids).map { |id| Integer(id.to_s, exception: false) }
    end

    # { row id => alternative }, for the alternatives that were asked for.
    def swaps
      @swaps ||= recipe.recipe_ingredients.flat_map(&:alternatives)
          .select { |alternative| chosen_alternative_ids.include?(alternative.id) }
          .index_by(&:recipe_ingredient_id)
    end

    # Each alternative must belong to a row of this recipe, and a row is swapped only once.
    def alternatives_of_this_recipe
      found = recipe.recipe_ingredients.flat_map(&:alternatives).select { |alternative| chosen_alternative_ids.include?(alternative.id) }

      if found.size != chosen_alternative_ids.uniq.size
        errors.add(:alternative_ids, :other_recipe)
      elsif found.map(&:recipe_ingredient_id).uniq.size != found.size
        errors.add(:alternative_ids, :one_per_ingredient)
      end
    end

    def ingredients_of_this_recipe
      if chosen_ids.empty?
        errors.add(:ingredient_ids, :blank)
      elsif (chosen_ids - recipe.recipe_ingredients.map(&:id)).any?
        errors.add(:ingredient_ids, :other_recipe)
      end
    end
end
