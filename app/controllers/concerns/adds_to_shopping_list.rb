# "Op lijst" for a recipe (Api::RecipesController) and for a variation
# (Api::RecipeVariationsController): the same steps, only the source differs.
# The controller stays thin; ShoppingListAddition checks, scales and stores.
#
#   POST …/add_to_shopping_list  { "servings": 6, "ingredient_ids": [ 12 ], "alternative_ids": [ 3 ] }
#
# Without servings the recipe's own number is used. ingredient_ids only for a recipe:
# without them, everything except the optional ingredients. alternative_ids: the
# alternatives swapped in on the recipe page (for a recipe and a variation alike).
module AddsToShoppingList
  extend ActiveSupport::Concern

  private
    def add_to_shopping_list_from(source, ingredient_ids: nil)
      addition = ShoppingListAddition.new(source: source, servings: params[:servings], ingredient_ids: ingredient_ids,
        alternative_ids: params[:alternative_ids])

      if addition.save
        render json: addition.items.map { |item| ShoppingListItemSerializer.item(item) }, status: :created
      else
        render_invalid(addition, message: addition.errors.full_messages.to_sentence)
      end
    end
end
