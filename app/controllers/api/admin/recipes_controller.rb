# What only the admin may do with a recipe whose deletion was requested: delete it for
# good, or put it back. Everything else (adding, editing) is public now.
class Api::Admin::RecipesController < Api::Admin::BaseController
  before_action :set_recipe

  # DELETE /api/admin/recipes/1
  def destroy
    @recipe.destroy!

    head :no_content
  end

  # PATCH /api/admin/recipes/1/restore
  def restore
    @recipe.cancel_deletion_request!

    render json: RecipeSerializer.summary(@recipe)
  end

  private
    # Only recipes with a deletion request: a visible recipe cannot be deleted by accident.
    def set_recipe
      @recipe = Recipe.deletion_requested.find(params[:id])
    end
end
