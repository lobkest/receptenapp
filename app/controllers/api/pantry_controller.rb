# "In huis": the one stock for the whole app, and the recipes you can make with it.
# Public like the shopping list: anyone with the link can see and change it, and every
# write counts towards the shared limit (PublicWriteRateLimit). Which ingredients are
# basisvoorraad is set per ingredient (PATCH /api/ingredients/1/staple).
class Api::PantryController < ApplicationController
  include PublicWriteRateLimit
  limit_public_writes only: %i[ update_ingredient update_ingredient_by_name reset ]

  # Quick picks under the search field: the ingredients most used in recipes.
  MAX_SUGGESTIONS = 12

  # GET /api/pantry
  def show
    render_pantry
  end

  # GET /api/pantry/recipes
  # GET /api/pantry/recipes?tags=vegetarisch,snel&category=3  (or category=overig)
  # The recipes with 0, 1 or 2 missing rows, in three groups (PantryMatcher). The tags
  # filter exactly like /api/recipes.
  def recipes
    recipes = Recipe.in_category(params[:category]).with_all_tags(params[:tags].to_s.split(","), evaluator: RecipeTagEvaluator.load)
    matcher = PantryMatcher.new(PantryItem.present_ingredient_ids)

    render json: PantrySerializer.recipes(matcher.results(recipes))
  end

  # PATCH /api/pantry/ingredients/12  { "pantry_item": { "present": true } }
  # In the house (true) or out (false). Sets a value, never "toggle": sending it twice is fine.
  def update_ingredient
    fields = params.expect(pantry_item: [ :present ])
    raise ActionController::ParameterMissing, :present unless fields.key?(:present)

    PantryItem.set!(Ingredient.find(params[:ingredient_id]), boolean_param(fields[:present]))
    render_pantry
  end

  # PATCH /api/pantry/ingredients  { "pantry_item": { "name": "wc-papier", "present": true } }
  # The same by name, for the house on a standard item (those have no ingredient_id).
  # Putting it in the house makes the ingredient when there is none yet; taking out a name
  # without an ingredient changes nothing (it was not in the house).
  def update_ingredient_by_name
    fields = params.expect(pantry_item: [ :name, :present ])
    raise ActionController::ParameterMissing, :present unless fields.key?(:present)

    present = boolean_param(fields[:present])
    name = Ingredient.normalize_value_for(:name, fields[:name].to_s)
    ingredient = Ingredient.find_by(name: name)
    ingredient ||= Ingredient.create_or_find_by!(name: name) if present
    PantryItem.set!(ingredient, present) if ingredient
    render_pantry
  end

  # POST /api/pantry/reset  ("Terug naar standaard": only the staples in the house)
  def reset
    PantryItem.delete_all
    render_pantry
  end

  private
    def render_pantry
      present = PantryItem.where(present: true).select(:ingredient_id)
      render json: PantrySerializer.pantry(
        in_house: Ingredient.where(staple: false, id: present).order(:name),
        staples: Ingredient.where(staple: true).includes(:pantry_item).order(:name),
        suggestions: suggestions(present)
      )
    end

    # Counted over the rows of visible recipes (also optional ones). Staples are left out:
    # they have their own section.
    def suggestions(present)
      Ingredient.joins(recipe_ingredients: :recipe).merge(Recipe.visible)
        .where(staple: false).where.not(id: present)
        .group(:id).order(Arel.sql("COUNT(*) DESC"), :name).limit(MAX_SUGGESTIONS).pluck(:id, :name)
    end
end
