# Variations of a visible recipe. Public, like recipes: anyone may add and edit (with
# lock_version), and deleting is a request the admin decides on. Writes count towards
# the shared limit (PublicWriteRateLimit).
class Api::RecipeVariationsController < ApplicationController
  include PublicWriteRateLimit
  include AddsToShoppingList
  limit_public_writes only: %i[ create update request_deletion add_to_shopping_list ]

  before_action :set_recipe
  before_action :set_variation, except: :create

  # POST /api/recipes/1/variations
  def create
    @variation = @recipe.variations.build(params.expect(variation: RecipeVariation::PERMITTED_ATTRIBUTES))

    if @variation.save
      render json: serialize(@variation), status: :created
    else
      render_invalid(@variation)
    end
  end

  # PATCH /api/recipes/1/variations/2  (lock_version is required, as for recipes)
  # A list that is not sent stays as it is; an empty list empties it.
  def update
    params.require(:variation).require(:lock_version)

    if @variation.update(params.expect(variation: [ :lock_version, *RecipeVariation::PERMITTED_ATTRIBUTES ]))
      render json: serialize(@variation)
    else
      render_invalid(@variation)
    end
  end

  # POST /api/recipes/1/variations/2/request_deletion  { "reason": "dubbel" }
  def request_deletion
    @variation.request_deletion!(params[:reason])

    head :no_content
  end

  # POST /api/recipes/1/variations/2/add_to_shopping_list  { "servings": 6 }
  # Puts the variation on the shopping list, scaled to servings (default: the recipe's).
  def add_to_shopping_list
    add_to_shopping_list_from(@variation)
  end

  private
    # Hidden recipes and variations (deletion requested) are reported as not found.
    def set_recipe
      @recipe = Recipe.visible.find(params[:recipe_id])
    end

    def set_variation
      @variation = @recipe.variations.visible.with_details.find(params[:id])
    end

    def serialize(variation)
      RecipeSerializer.variation(RecipeVariation.with_details.find(variation.id))
    end
end
