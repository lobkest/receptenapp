class Api::TraitsController < ApplicationController
  # GET /api/traits  [ { "name": "vlees" }, ... ]: the chips on the ingredients page, in order.
  def index
    render json: Trait.ordered.map { |trait| { name: trait.name } }
  end
end
