# Ingredients and their nutrition settings: a link to a NEVO product, conversions to grams
# and label values. Anyone may edit, like recipes (lock_version, rate limited). The name
# is not edited here: it is how recipes refer to the ingredient.
#
# Not in the recipe history (RecipeVersion): an ingredient belongs to many recipes at once,
# and a recipe version is a snapshot of one recipe.
class Api::IngredientsController < ApplicationController
  include PublicWriteRateLimit
  limit_public_writes only: %i[ update ]

  before_action :set_ingredient, only: %i[ show update ]

  # GET /api/ingredients  (all of them; the page searches and filters itself)
  def index
    ingredients = Ingredient.includes(:nevo_food).order(:name)

    render json: ingredients.map { |ingredient| IngredientSerializer.summary(ingredient) }
  end

  # GET /api/ingredients/1
  def show
    render json: IngredientSerializer.detail(@ingredient)
  end

  # PATCH /api/ingredients/1  { "ingredient": { "lock_version": 3, "nevo_food_id": 12, ... } }
  # Saving means a person looked at it, so "te controleren" goes off ("Klopt" sends only
  # lock_version). If someone else saved in between, the answer is 409.
  def update
    params.require(:ingredient).require(:lock_version)
    @ingredient.assign_attributes(ingredient_params)
    @ingredient.needs_review = false

    if @ingredient.save
      render json: IngredientSerializer.detail(Ingredient.includes(:nevo_food).find(@ingredient.id))
    else
      render_invalid(@ingredient)
    end
  end

  private
    def set_ingredient
      @ingredient = Ingredient.includes(:nevo_food).find(params[:id])
    end

    def ingredient_params
      params.expect(ingredient: [ :lock_version, :nevo_food_id, :grams_per_piece, :grams_per_ml, *Ingredient::LABEL_COLUMNS.values ])
    end
end
