# "Op lijst" for a recipe (Api::RecipesController) and for a variation
# (Api::RecipeVariationsController): the same steps, only the source differs.
# The controller stays thin; ShoppingListAddition checks, scales and stores.
#
#   POST …/add_to_shopping_list  { "servings": 6, "ingredient_ids": [ 12 ], "alternative_ids": [ 3 ] }
#   POST …/add_to_shopping_list  { "servings": 6, "skip_ingredient_ids": [ 14 ], "skip_addition_ids": [ 2 ] }
#
# Without servings the recipe's own number is used. ingredient_ids only for a recipe:
# without them, everything except the optional ingredients. alternative_ids: the
# alternatives swapped in on the recipe page (for a recipe and a variation alike).
# skip_ingredient_ids and skip_addition_ids: what the recipe page shows as in the house;
# "Alles op lijst" and "Variatie op lijst" leave those out (the browser counts them).
module AddsToShoppingList
  extend ActiveSupport::Concern

  private
    def add_to_shopping_list_from(source, ingredient_ids: nil)
      addition = ShoppingListAddition.new(source: source, servings: params[:servings], ingredient_ids: ingredient_ids,
        alternative_ids: params[:alternative_ids], skip_ingredient_ids: params[:skip_ingredient_ids],
        skip_addition_ids: params[:skip_addition_ids])

      if addition.save
        render json: ShoppingListItemSerializer.items(addition.items), status: :created
      else
        render_invalid(addition, message: addition.errors.full_messages.to_sentence)
      end
    end
end
