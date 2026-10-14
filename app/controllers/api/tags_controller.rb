class Api::TagsController < ApplicationController
  # GET /api/tags
  # Only tags of visible recipes, with how many visible recipes have them. Tags of recipes
  # whose deletion was requested, and tags no recipe uses any more, do not show up.
  def index
    counts = Tag.joins(:recipes).merge(Recipe.visible).group(:name).order(:name).count

    render json: counts.map { |name, count| { name: name, count: count } }
  end
end
