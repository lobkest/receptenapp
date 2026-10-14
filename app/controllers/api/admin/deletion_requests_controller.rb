class Api::Admin::DeletionRequestsController < Api::Admin::BaseController
  # GET /api/admin/deletion_requests  (newest request first)
  def index
    recipes = Recipe.deletion_requested.order(deletion_requested_at: :desc, id: :desc)

    render json: recipes.map { |recipe|
      recipe.slice("id", "title", "deletion_requested_at", "deletion_reason").merge("type" => "recipe")
    }
  end
end
