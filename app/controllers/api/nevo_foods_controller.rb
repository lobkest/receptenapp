# Searching the NEVO products, for linking an ingredient (the ingredient edit page).
class Api::NevoFoodsController < ApplicationController
  # GET /api/nevo_foods?q=kikkererwten  (the best 20; without q nothing)
  def index
    render json: NevoFood.search(params[:q]).map { |food| IngredientSerializer.nevo_food(food) }
  end
end
