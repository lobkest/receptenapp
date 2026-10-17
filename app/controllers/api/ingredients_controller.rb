# Ingredients and their nutrition settings: a link to a NEVO product, conversions to grams
# and label values. Anyone may edit, like recipes (lock_version, rate limited). The name
# is not edited here: it is how recipes refer to the ingredient.
#
# Not in the recipe history (RecipeVersion): an ingredient belongs to many recipes at once,
# and a recipe version is a snapshot of one recipe.
class Api::IngredientsController < ApplicationController
  include PublicWriteRateLimit
  limit_public_writes only: %i[ update update_traits update_staple ]

  before_action :set_ingredient, only: %i[ show update update_traits update_staple ]

  # GET /api/ingredients  (all of them; the page searches and filters itself)
  def index
    ingredients = Ingredient.with_details.order(:name)

    render json: ingredients.map { |ingredient| IngredientSerializer.summary(ingredient) }
  end

  # GET /api/ingredients/1
  def show
    render json: IngredientSerializer.detail(@ingredient)
  end

  # PATCH /api/ingredients/1  { "ingredient": { "lock_version": 3, "nevo_food_id": 12, ... } }
  # Saving means a person looked at it, so "te controleren" goes off ("Klopt" sends only
  # lock_version). If someone else saved in between, the answer is 409.
  def update
    params.require(:ingredient).require(:lock_version)
    @ingredient.assign_attributes(ingredient_params)
    @ingredient.needs_review = false

    if @ingredient.save
      render json: IngredientSerializer.detail(Ingredient.with_details.find(@ingredient.id))
    else
      render_invalid(@ingredient)
    end
  end

  # PATCH /api/ingredients/1/traits  { "ingredient": { "trait_names": [ "vlees", "dierlijk" ] } }
  # PATCH /api/ingredients/1/traits  { "ingredient": { "traits_checked": true } }  ("Gecontroleerd")
  # The traits for the automatic tags. Without lock_version: every chip sends the whole
  # list, and the last one wins. It leaves the ingredient row (and its lock_version) alone
  # apart from traits_checked, so an edit form open on the NEVO settings is not affected.
  def update_traits
    fields = params.expect(ingredient: [ :traits_checked, trait_names: [] ])
    names = Array(fields[:trait_names]).map { |name| Trait.normalize_value_for(:name, name.to_s) }.uniq
    traits = Trait.where(name: names).to_a
    if traits.size < names.size
      return render_error :unprocessable_content, I18n.t("api.invalid"), trait_names: [ I18n.t("errors.messages.inclusion") ]
    end

    Ingredient.transaction do
      @ingredient.traits = traits if fields.key?(:trait_names)
      @ingredient.update_columns(traits_checked: boolean_param(fields[:traits_checked]), updated_at: Time.current) if fields.key?(:traits_checked)
    end

    render json: IngredientSerializer.summary(Ingredient.with_details.find(@ingredient.id))
  end

  # PATCH /api/ingredients/1/staple  { "ingredient": { "staple": true } }
  # Basisvoorraad: in the house unless someone says it is out ("In huis"). Like the traits:
  # without lock_version, the last one wins, and the NEVO settings are left alone. What
  # the stock said about this ingredient goes: it starts again from the new default.
  def update_staple
    fields = params.expect(ingredient: [ :staple ])
    raise ActionController::ParameterMissing, :staple unless fields.key?(:staple)

    Ingredient.transaction do
      @ingredient.update_columns(staple: boolean_param(fields[:staple]), updated_at: Time.current)
      PantryItem.where(ingredient_id: @ingredient.id).delete_all
    end

    render json: IngredientSerializer.summary(Ingredient.with_details.find(@ingredient.id))
  end

  private
    def set_ingredient
      @ingredient = Ingredient.with_details.find(params[:id])
    end

    def ingredient_params
      params.expect(ingredient: [ :lock_version, :nevo_food_id, :grams_per_piece, :grams_per_ml, :negligible, *Ingredient::LABEL_COLUMNS.values ])
    end
end
