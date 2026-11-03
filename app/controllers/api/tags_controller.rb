class Api::TagsController < ApplicationController
  # GET /api/tags
  # Only tags of visible recipes, with how many visible recipes have them. Tags of recipes
  # whose deletion was requested, and tags no recipe uses any more, do not show up.
  # automatic: worked out from the ingredients (RecipeTagEvaluator); see Tag.counts.
  def index
    render json: Tag.counts
  end
end
