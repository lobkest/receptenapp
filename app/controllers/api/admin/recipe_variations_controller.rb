# What only the admin may do with a variation whose deletion was requested: delete it for
# good, or put it back. Like Api::Admin::RecipesController.
class Api::Admin::RecipeVariationsController < Api::Admin::BaseController
  before_action :set_variation

  # DELETE /api/admin/variations/1
  def destroy
    @variation.destroy!

    head :no_content
  end

  # PATCH /api/admin/variations/1/restore
  def restore
    @variation.cancel_deletion_request!

    render json: @variation.slice("id", "name", "recipe_id")
  end

  private
    # Only variations with a deletion request: a visible one cannot be deleted by accident.
    def set_variation
      @variation = RecipeVariation.deletion_requested.find(params[:id])
    end
end
