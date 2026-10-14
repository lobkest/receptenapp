class Api::Admin::RecipesController < Api::Admin::BaseController
  before_action :set_recipe, only: %i[ update destroy approve reject ]

  # GET /api/admin/recipes
  # GET /api/admin/recipes?status=pending
  def index
    status = params[:status]

    if status.present? && !Recipe.statuses.key?(status)
      render json: { error: "Unknown status" }, status: :bad_request
    else
      @recipes = Recipe.order(:id)
      @recipes = @recipes.where(status: status) if status.present?

      render json: @recipes.map { |recipe| RecipeSerializer.summary(recipe) }
    end
  end

  # GET /api/admin/recipes/1
  def show
    render json: RecipeSerializer.detail(Recipe.with_details.find(params[:id]))
  end

  # PATCH/PUT /api/admin/recipes/1
  def update
    if @recipe.update(recipe_params)
      # Reloaded, so steps come back in their new order.
      render json: RecipeSerializer.detail(Recipe.with_details.find(@recipe.id))
    else
      render json: { errors: @recipe.errors }, status: :unprocessable_content
    end
  end

  # DELETE /api/admin/recipes/1
  def destroy
    @recipe.destroy!

    head :no_content
  end

  # PATCH /api/admin/recipes/1/approve
  def approve
    @recipe.approved!

    render json: RecipeSerializer.summary(@recipe)
  end

  # PATCH /api/admin/recipes/1/reject
  def reject
    @recipe.rejected!

    render json: RecipeSerializer.summary(@recipe)
  end

  private
    def set_recipe
      @recipe = Recipe.find(params[:id])
    end

    # Status changes only through approve and reject. Unlike the public form, an admin can
    # edit existing rows (id) and remove them (_destroy). Positions still come from the order.
    def recipe_params
      params.expect(recipe: [ :title, :description, :servings,
        steps_attributes: [ [ :id, :body, :_destroy ] ],
        recipe_ingredients_attributes: [ [ :id, :ingredient_name, :quantity, :unit, :optional, :_destroy ] ] ])
    end
end
