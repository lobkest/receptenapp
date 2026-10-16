# A row that names an Ingredient by text ("  Verse BASILICUM "): RecipeIngredient and
# RecipeIngredientAlternative. The name is looked up, or a new ingredient is built in
# memory, and only created when the whole recipe is saved.
#
#   class RecipeIngredient < ApplicationRecord
#     include NamedIngredient
#     validates :ingredient_name, presence: true
#   end
#
#   row.ingredient_name = "Bloem"  # links the existing "bloem" when validated
module NamedIngredient
  extend ActiveSupport::Concern

  included do
    # Optional here because ingredient_name is validated instead; the column is NOT NULL.
    belongs_to :ingredient, optional: true

    before_validation :link_ingredient
    # prepend: runs before the belongs_to autosave would insert the new ingredient itself.
    before_save :save_new_ingredient, prepend: true

    attr_writer :ingredient_name
  end

  # The submitted name, normalized like Ingredient#name, or the linked ingredient's name.
  def ingredient_name
    return ingredient&.name if @ingredient_name.nil?

    Ingredient.normalize_value_for(:name, @ingredient_name.to_s)
  end

  # A nested row is only validated and saved when it changed (autosave). A new name is not
  # a column change until link_ingredient runs, so it counts here; otherwise renaming a
  # row in the edit form would quietly keep the old ingredient.
  def changed_for_autosave?
    super || ingredient_name_changed?
  end

  def ingredient_name_changed?
    !@ingredient_name.nil? && ingredient_name != ingredient&.name
  end

  private
    # Looks up the ingredient, but only builds a new one in memory: nothing is written
    # unless the whole recipe turns out valid.
    def link_ingredient
      return if @ingredient_name.nil? || ingredient_name.blank?

      self.ingredient = Ingredient.find_by(name: ingredient_name) || Ingredient.new(name: ingredient_name)
    end

    # Runs inside the recipe's save transaction, so a failed save rolls it back too.
    # create_or_find_by! uses a savepoint: if another request just created the same
    # ingredient, the unique index fails quietly and the existing row is returned.
    def save_new_ingredient
      self.ingredient = Ingredient.create_or_find_by!(name: ingredient.name) if ingredient&.new_record?
    end
end
