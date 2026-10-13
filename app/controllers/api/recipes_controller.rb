class Api::RecipesController < ApplicationController
  before_action :set_recipe, only: :show

  rate_limit to: 5, within: 1.hour, only: :create,
    with: -> { render json: { error: "Too many submissions, try again later" }, status: :too_many_requests }

  rescue_from ActiveRecord::RecordNotFound, with: :render_not_found

  # GET /api/recipes
  def index
    @recipes = Recipe.approved.order(:id)

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
      render json: @recipe, status: :created
    else
      render json: { errors: @recipe.errors }, status: :unprocessable_content
    end
  end

  private
    # Unapproved recipes are reported as not found, so guessing ids reveals nothing.
    def set_recipe
      @recipe = Recipe.approved.find(params[:id])
    end

    # Only allow a list of trusted parameters through. Status is never accepted from the public.
    def recipe_params
      params.expect(recipe: [ :title, :description, :servings ])
    end

    def render_not_found
      render json: { error: "Recipe not found" }, status: :not_found
    end
end
