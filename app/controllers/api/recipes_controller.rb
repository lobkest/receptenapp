class Api::RecipesController < ApplicationController
  before_action :set_recipe, only: %i[ show update destroy ]

  rescue_from ActiveRecord::RecordNotFound, with: :render_not_found

  # GET /api/recipes
  def index
    @recipes = Recipe.order(:id)

    render json: @recipes
  end

  # GET /api/recipes/1
  def show
    render json: @recipe
  end

  # POST /api/recipes
  def create
    @recipe = Recipe.new(recipe_params)

    if @recipe.save
      render json: @recipe, status: :created, location: api_recipe_url(@recipe)
    else
      render json: { errors: @recipe.errors }, status: :unprocessable_content
    end
  end

  # PATCH/PUT /api/recipes/1
  def update
    if @recipe.update(recipe_params)
      render json: @recipe
    else
      render json: { errors: @recipe.errors }, status: :unprocessable_content
    end
  end

  # DELETE /api/recipes/1
  def destroy
    @recipe.destroy!

    head :no_content
  end

  private
    def set_recipe
      @recipe = Recipe.find(params[:id])
    end

    # Only allow a list of trusted parameters through.
    def recipe_params
      params.expect(recipe: [ :title, :description, :servings ])
    end

    def render_not_found
      render json: { error: "Recipe not found" }, status: :not_found
    end
end
