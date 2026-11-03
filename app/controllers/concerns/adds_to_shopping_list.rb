# "Op lijst" for a recipe (Api::RecipesController) and for a variation
# (Api::RecipeVariationsController): the same steps, only the source differs.
# The controller stays thin; ShoppingListAddition checks, scales and stores.
#
#   POST …/add_to_shopping_list  { "servings": 6, "ingredient_ids": [ 12 ], "alternative_ids": [ 3 ] }
#   POST …/add_to_shopping_list  { "servings": 6, "skip_ingredient_ids": [ 14 ], "skip_addition_ids": [ 2 ] }
#   POST …/add_to_shopping_list  { "servings": 6, "skip_in_house": true, "client_action_id": "…uuid…" }
#
# Without servings the recipe's own number is used. ingredient_ids only for a recipe:
# without them, everything except the optional ingredients. alternative_ids: the
# alternatives swapped in on the recipe page (for a recipe and a variation alike).
# skip_ingredient_ids and skip_addition_ids: what the recipe page shows as in the house;
# "Alles op lijst" and "Variatie op lijst" leave those out (the browser counts them).
# skip_in_house: the server leaves out what is in the house now (a change made offline).
# client_action_id: sent again (offline sync), it adds nothing and returns the lines of the
# first time with 200 instead of 201 (ClientAction).
module AddsToShoppingList
  extend ActiveSupport::Concern

  private
    def add_to_shopping_list_from(source, ingredient_ids: nil)
      addition = ShoppingListAddition.new(source: source, servings: params[:servings], ingredient_ids: ingredient_ids,
        alternative_ids: params[:alternative_ids], skip_ingredient_ids: params[:skip_ingredient_ids],
        skip_addition_ids: params[:skip_addition_ids], skip_in_house: boolean_param(params[:skip_in_house]))

      items, created = ClientAction.once(params[:client_action_id]) { addition.save! && addition.items }
      render json: ShoppingListItemSerializer.items(items), status: created ? :created : :ok
    rescue ActiveModel::ValidationError
      render_invalid(addition, message: addition.errors.full_messages.to_sentence)
    end
end
