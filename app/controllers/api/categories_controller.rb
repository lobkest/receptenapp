class Api::CategoriesController < ApplicationController
  # GET /api/categories
  # All categories in their order (position), also those without recipes: the recipe
  # form offers them all. New ones are made through a recipe (category_name).
  def index
    render json: Category.ordered.map { |category| RecipeSerializer.category(category) }
  end
end
