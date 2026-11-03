# What is in the house ("In huis"): one stock for the whole app, like the shopping list,
# open to anyone with the link. Only what differs from the default is stored:
# - a staple (Ingredient#staple: zout, olijfolie, ...) is in the house, unless a row says
#   present: false ("op");
# - any other ingredient is not, unless a row says present: true.
# A row that would say the same as the default is deleted instead, so "Terug naar
# standaard" is deleting every row.
class PantryItem < ApplicationRecord
  belongs_to :ingredient

  # The ids of every ingredient in the house, in one query: the row if there is one,
  # otherwise the default (staple).
  def self.present_ingredient_ids
    Ingredient.left_joins(:pantry_item).where("COALESCE(pantry_items.present, ingredients.staple)").pluck(:id).to_set
  end

  # Quick picks under the search field on "In huis": the ingredients most used in recipes.
  MAX_SUGGESTIONS = 12

  # What /api/pantry (and the offline snapshot) shows, for PantrySerializer.pantry:
  # in_house: what else is in the house (not a staple); staples: every staple; suggestions:
  # quick picks, counted over the rows of visible recipes (also optional ones), without
  # staples (they have their own section) and without what is in the house already.
  def self.overview
    present = where(present: true).select(:ingredient_id)
    {
      in_house: Ingredient.where(staple: false, id: present).order(:name),
      staples: Ingredient.where(staple: true).includes(:pantry_item).order(:name),
      suggestions: Ingredient.joins(recipe_ingredients: :recipe).merge(Recipe.visible)
        .where(staple: false).where.not(id: present)
        .group(:id).order(Arel.sql("COUNT(*) DESC"), :name).limit(MAX_SUGGESTIONS).pluck(:id, :name)
    }
  end

  # Puts an ingredient in the house (present true) or takes it out. Returns true when that
  # changed something, false when it already was so.
  def self.set!(ingredient, present)
    row = find_by(ingredient_id: ingredient.id)
    return false if (row ? row.present : ingredient.staple) == present

    if present == ingredient.staple
      where(ingredient_id: ingredient.id).delete_all
    else
      upsert({ ingredient_id: ingredient.id, present: present }, unique_by: :ingredient_id)
    end
    true
  end
end
