# Catch-all for unknown /api routes, so they answer with JSON instead of HTML.
class Api::NotFoundController < ApplicationController
  def show
    render json: { error: "Not found" }, status: :not_found
  end
end
