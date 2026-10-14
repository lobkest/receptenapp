# "Op lijst" for a recipe (Api::RecipesController) and for a variation
# (Api::RecipeVariationsController): the same steps, only the source differs.
# The controller stays thin; ShoppingListAddition checks, scales and stores.
#
#   POST …/add_to_shopping_list  { "servings": 6, "ingredient_ids": [ 12 ] }
#
# Without servings the recipe's own number is used. ingredient_ids only for a recipe:
# without them, everything except the optional ingredients.
module AddsToShoppingList
  extend ActiveSupport::Concern

  private
    def add_to_shopping_list_from(source, ingredient_ids: nil)
      addition = ShoppingListAddition.new(source: source, servings: params[:servings], ingredient_ids: ingredient_ids)

      if addition.save
        render json: addition.items.map { |item| ShoppingListItemSerializer.item(item) }, status: :created
      else
        render_invalid(addition, message: addition.errors.full_messages.to_sentence)
      end
    end
end
