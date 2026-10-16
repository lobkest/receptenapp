# Merging two ingredients: only with the admin code, because it deletes an ingredient
# (like deleting a recipe). See IngredientMerge for what moves where.
class Api::Admin::IngredientsController < Api::Admin::BaseController
  # POST /api/admin/ingredients/12/merge  { "target_id": 7 }
  # 12 goes into 7. The answer is the target (as GET /api/ingredients/7), plus what happened.
  def merge
    source = Ingredient.find(params[:id])
    target = Ingredient.find(params.require(:target_id))
    result = IngredientMerge.new(source, target).call

    render json: {
      "target" => IngredientSerializer.detail(Ingredient.includes(:nevo_food).find(target.id)),
      "source_deleted" => result.source_deleted,
      "moved_recipes" => result.moved_recipes,
      "skipped_recipes" => result.skipped_recipes,
      "copied" => result.copied
    }
  rescue IngredientMerge::Invalid => error
    render_error :unprocessable_content, error.message, target_id: [ error.message ]
  end
end
