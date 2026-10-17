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
