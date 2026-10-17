class Api::RecipesController < ApplicationController
  # Every public write counts towards the shared limit (PublicWriteRateLimit); adding a
  # recipe also has its own, stricter limit per hour below.
  include PublicWriteRateLimit
  include AddsToShoppingList
  limit_public_writes only: %i[ create update request_deletion add_to_shopping_list ]

  before_action :set_recipe, only: %i[ show update request_deletion add_to_shopping_list ]

  # Configurable so the e2e tests can raise it; without the variable it stays 5 per hour.
  SUBMISSIONS_PER_HOUR = Integer(ENV.fetch("RECIPE_SUBMISSIONS_PER_HOUR", 5))

  # Per visitor (client_ip, see ClientIp), like the other limits.
  rate_limit to: SUBMISSIONS_PER_HOUR, within: 1.hour, only: :create, by: -> { client_ip },
    with: -> { render_error :too_many_requests, I18n.t("api.too_many_submissions") }

  # GET /api/recipes
  # GET /api/recipes?tags=vega,snel  (only recipes with all of these tags)
  # Tags set by hand and automatic ones (vegetarisch, "met_wissel" passes too): see
  # Recipe.with_all_tags.
  def index
    evaluator = RecipeTagEvaluator.load
    @recipes = Recipe.with_all_tags(params[:tags].to_s.split(","), evaluator: evaluator)

    render json: @recipes.map { |recipe| RecipeSerializer.summary(recipe, evaluator: evaluator) }
  end

  # GET /api/recipes/1
  def show
    render json: RecipeSerializer.detail(@recipe)
  end

  # POST /api/recipes  (visible right away)
  # category_name: "Diner" picks that category (in any case), a new name makes a new one,
  # "" or null means none. Left out on update: the category stays as it is.
  def create
    @recipe = Recipe.new(create_params)

    if @recipe.save
      render json: RecipeSerializer.detail(@recipe), status: :created
    else
      render_invalid(@recipe)
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
      render_invalid(@recipe)
    end
  end

  # POST /api/recipes/1/request_deletion  { "reason": "dubbel" }
  # Hidden at once for everybody; the admin deletes it for good or puts it back.
  def request_deletion
    @recipe.request_deletion!(params[:reason])

    head :no_content
  end

  # POST /api/recipes/1/add_to_shopping_list  { "servings": 6 }                       Alles op lijst
  # POST /api/recipes/1/add_to_shopping_list  { "servings": 6, "ingredient_ids": [12] } + lijst
  # With "alternative_ids": [3] the swapped rows go on the list as their alternative.
  # The browser only says what; the server scales (Quantity) and stores the lines.
  def add_to_shopping_list
    add_to_shopping_list_from(@recipe, ingredient_ids: params[:ingredient_ids])
  end

  private
    # Hidden recipes (deletion requested) are reported as not found.
    def set_recipe
      @recipe = Recipe.visible.with_details.find(params[:id])
    end

    # A new recipe only creates new rows, so no ids, _destroy or positions. An ingredient
    # row may bring its alternatives (alternatives_attributes), in the same way.
    # [ [ ... ] ] means "an array of hashes with these keys".
    # variations_attributes: new variations only (no id), from "+ Variatie toevoegen".
    def create_params
      params.expect(recipe: [ :title, :description, :servings, :category_name, tag_names: [],
        steps_attributes: [ [ :body ] ],
        recipe_ingredients_attributes: [ [ :ingredient_name, :quantity, :unit, :optional,
          alternatives_attributes: [ [ :ingredient_name, :quantity, :unit ] ] ] ],
        variations_attributes: [ Api::RecipeVariationsController::FIELDS ] ])
    end

    # Editing may change existing rows (id) and remove them (_destroy). Rails checks that
    # every id belongs to this recipe. Positions still come from the order. Existing rows
    # keep their id, so a variation that leaves out a row ("− tofu") stays attached to it.
    def update_params
      params.expect(recipe: [ :title, :description, :servings, :category_name, :lock_version, tag_names: [],
        steps_attributes: [ [ :id, :body, :_destroy ] ],
        recipe_ingredients_attributes: [ [ :id, :ingredient_name, :quantity, :unit, :optional, :_destroy,
          alternatives_attributes: [ [ :id, :ingredient_name, :quantity, :unit, :_destroy ] ] ] ],
        variations_attributes: [ Api::RecipeVariationsController::FIELDS ] ])
    end
end
