class Api::Admin::RecipeVersionsController < Api::Admin::BaseController
  before_action :set_recipe

  # GET /api/admin/recipes/1/versions  (newest first; the first one is the current state)
  # Also for a hidden recipe, so the admin can look back before deciding.
  def index
    versions = @recipe.versions.newest_first

    render json: {
      recipe: @recipe.slice("id", "title", "deletion_requested_at"),
      versions: versions.map.with_index { |version, index|
        version.slice("id", "created_at", "summary").merge("current" => index.zero?)
      }
    }
  end

  # POST /api/admin/recipes/1/versions/5/restore
  def restore
    version = @recipe.versions.find(params[:id])
    @recipe.restore_version!(version)

    render json: RecipeSerializer.detail(Recipe.with_details.find(@recipe.id))
  end

  private
    def set_recipe
      @recipe = Recipe.find(params[:recipe_id])
    end
end
