class Api::RecipesController < ApplicationController
  # Every public write counts towards the shared limit (PublicWriteRateLimit); adding a
  # recipe also has its own, stricter limit per hour below.
  include PublicWriteRateLimit
  limit_public_writes only: %i[ create update request_deletion ]

  before_action :set_recipe, only: %i[ show update request_deletion ]

  # Configurable so the e2e tests can raise it; without the variable it stays 5 per hour.
  SUBMISSIONS_PER_HOUR = Integer(ENV.fetch("RECIPE_SUBMISSIONS_PER_HOUR", 5))

  rate_limit to: SUBMISSIONS_PER_HOUR, within: 1.hour, only: :create,
    with: -> { render json: { error: "Too many submissions, try again later" }, status: :too_many_requests }

  rescue_from ActiveRecord::RecordNotFound, with: :render_not_found
  rescue_from ActiveRecord::StaleObjectError, with: :render_conflict
  rescue_from ActiveRecord::RecordInvalid, with: ->(error) { @recipe = error.record; render_errors }

  # GET /api/recipes
  # GET /api/recipes?tags=vega,snel  (only recipes with all of these tags)
  def index
    @recipes = Recipe.visible.tagged_with_all(params[:tags].to_s.split(",")).includes(:tags).order(:id)

    render json: @recipes.map { |recipe| RecipeSerializer.summary(recipe) }
  end

  # GET /api/recipes/1
  def show
    render json: RecipeSerializer.detail(@recipe)
  end

  # POST /api/recipes  (visible right away)
  def create
    @recipe = Recipe.new(create_params)

    if @recipe.save
      render json: RecipeSerializer.detail(@recipe), status: :created
    else
      render_errors
    end
  end

  # PATCH /api/recipes/1  (anyone may edit; lock_version is required)
  # lock_version is the number the editor got with the recipe. If someone else saved in
  # the meantime, the number in the database is higher and Rails raises StaleObjectError.
  def update
    params.require(:recipe).require(:lock_version)

    if @recipe.update(update_params)
      render json: RecipeSerializer.detail(Recipe.with_details.find(@recipe.id))
    else
      render_errors
    end
  end

  # POST /api/recipes/1/request_deletion  { "reason": "dubbel" }
  # Hidden at once for everybody; the admin deletes it for good or puts it back.
  def request_deletion
    @recipe.request_deletion!(params[:reason])

    head :no_content
  end

  private
    # Hidden recipes (deletion requested) are reported as not found.
    def set_recipe
      @recipe = Recipe.visible.with_details.find(params[:id])
    end

    # A new recipe only creates new rows, so no ids, _destroy or positions.
    # [ [ ... ] ] means "an array of hashes with these keys".
    # variations_attributes: new variations only (no id), from "+ Variatie toevoegen".
    def create_params
      params.expect(recipe: [ :title, :description, :servings, tag_names: [],
        steps_attributes: [ [ :body ] ],
        recipe_ingredients_attributes: [ [ :ingredient_name, :quantity, :unit, :optional ] ],
        variations_attributes: [ Api::RecipeVariationsController::FIELDS ] ])
    end

    # Editing may change existing rows (id) and remove them (_destroy). Rails checks that
    # every id belongs to this recipe. Positions still come from the order. Existing rows
    # keep their id, so a variation that leaves out a row ("− tofu") stays attached to it.
    def update_params
      params.expect(recipe: [ :title, :description, :servings, :lock_version, tag_names: [],
        steps_attributes: [ [ :id, :body, :_destroy ] ],
        recipe_ingredients_attributes: [ [ :id, :ingredient_name, :quantity, :unit, :optional, :_destroy ] ],
        variations_attributes: [ Api::RecipeVariationsController::FIELDS ] ])
    end

    def render_errors
      render json: { errors: @recipe.errors }, status: :unprocessable_content
    end

    def render_not_found
      render json: { error: "Recipe not found" }, status: :not_found
    end

    def render_conflict
      render json: { error: I18n.t("recipes.conflict") }, status: :conflict
    end
end
