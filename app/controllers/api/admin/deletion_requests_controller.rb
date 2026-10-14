class Api::Admin::DeletionRequestsController < Api::Admin::BaseController
  # GET /api/admin/deletion_requests  (recipes and variations together, newest request first)
  # type tells them apart: "recipe", or "variation" with the recipe it belongs to.
  def index
    recipes = Recipe.deletion_requested.map { |recipe|
      recipe.slice("id", "title", "deletion_requested_at", "deletion_reason").merge("type" => "recipe")
    }
    variations = RecipeVariation.deletion_requested.includes(:recipe).map { |variation|
      variation.slice("id", "deletion_requested_at", "deletion_reason").merge(
        "type" => "variation", "title" => variation.name,
        "recipe_id" => variation.recipe_id, "recipe_title" => variation.recipe.title)
    }

    render json: (recipes + variations).sort_by { |request| [ request["deletion_requested_at"], request["id"] ] }.reverse
  end
end
