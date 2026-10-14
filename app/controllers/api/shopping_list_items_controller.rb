# The one shared shopping list. Public: anyone with the link can see and change it, from
# any device. Writes are rate limited (PublicWriteRateLimit).
class Api::ShoppingListItemsController < ApplicationController
  include PublicWriteRateLimit
  limit_public_writes only: %i[ create update destroy clear_checked clear_all ]

  # "Alles op lijst" for a big recipe is a few dozen; this only stops absurd requests.
  MAX_ITEMS_PER_REQUEST = 100
  ITEM_FIELDS = %i[ name quantity unit source_label recipe_id checked ].freeze

  before_action :set_item, only: %i[ update destroy ]

  rescue_from ActiveRecord::RecordNotFound, with: :render_not_found

  # GET /api/shopping_list_items
  def index
    render json: ShoppingListItem.order(:id).map { |item| serialize(item) }
  end

  # POST /api/shopping_list_items  { "shopping_list_item": { "name": "melk", ... } }
  # POST /api/shopping_list_items  { "shopping_list_items": [ { "name": "melk", ... }, ... ] }
  #
  # Every item becomes its own line, also when the same name and unit is already on the list:
  # each line keeps its own source_label and recipe_id. One item returns that item; several
  # return the new lines in the order they were sent.
  def create
    if params.key?(:shopping_list_items)
      create_many(params.expect(shopping_list_items: [ ITEM_FIELDS ]))
    else
      create_one(params.expect(shopping_list_item: ITEM_FIELDS))
    end
  end

  # PATCH/PUT /api/shopping_list_items/1  { "shopping_list_item": { "checked": true } }
  def update
    if @item.update(params.expect(shopping_list_item: %i[ checked name ]))
      render json: serialize(@item)
    else
      render json: { errors: @item.errors }, status: :unprocessable_content
    end
  end

  # DELETE /api/shopping_list_items/1
  def destroy
    @item.destroy!

    head :no_content
  end

  # DELETE /api/shopping_list_items/clear_checked
  def clear_checked
    ShoppingListItem.where(checked: true).delete_all

    head :no_content
  end

  # DELETE /api/shopping_list_items/clear_all
  def clear_all
    ShoppingListItem.delete_all

    head :no_content
  end

  private
    def set_item
      @item = ShoppingListItem.find(params[:id])
    end

    def create_one(attributes)
      item = ShoppingListItem.new(attributes)

      if item.save
        render json: serialize(item), status: :created
      else
        render json: { errors: item.errors }, status: :unprocessable_content
      end
    end

    # All or nothing: one invalid item rolls back the ones before it, and the response
    # says which one (index, counting from 0) and why.
    def create_many(attributes_list)
      if attributes_list.size > MAX_ITEMS_PER_REQUEST
        return render json: { error: "At most #{MAX_ITEMS_PER_REQUEST} items per request" }, status: :unprocessable_content
      end

      failed_index = failed_item = nil
      items = ShoppingListItem.transaction do
        attributes_list.each_with_index.map do |attributes, index|
          item = ShoppingListItem.new(attributes)
          unless item.save
            failed_index, failed_item = index, item
            raise ActiveRecord::Rollback
          end
          item
        end
      end

      if failed_item
        render json: { index: failed_index, errors: failed_item.errors }, status: :unprocessable_content
      else
        render json: items.map { |item| serialize(item) }, status: :created
      end
    end

    def serialize(item)
      item.slice("id", "name", "unit", "source_label", "recipe_id", "checked")
        .merge("quantity" => RecipeSerializer.number(item.quantity))
    end

    def render_not_found
      render json: { error: "Shopping list item not found" }, status: :not_found
    end
end
