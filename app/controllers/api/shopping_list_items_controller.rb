# The one shared shopping list. Public: anyone with the link can see and change it, from
# any device. Writes are rate limited (PublicWriteRateLimit).
class Api::ShoppingListItemsController < ApplicationController
  include PublicWriteRateLimit
  limit_public_writes only: %i[ create update destroy remove_standard remove_recipe clear_checked clear_all ]

  # "Alles op lijst" for a big recipe is a few dozen; this only stops absurd requests.
  MAX_ITEMS_PER_REQUEST = 100
  ITEM_FIELDS = %i[ name quantity unit source_label recipe_id checked ].freeze

  before_action :set_item, only: %i[ update destroy remove_standard remove_recipe ]

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
      render_invalid(@item)
    end
  end

  # DELETE /api/shopping_list_items/1
  def destroy
    @item.destroy!

    head :no_content
  end

  # POST /api/shopping_list_items/1/remove_standard
  # The minus button: one less from the standard list. { "item": line } or, when the line
  # is gone, { "item": null }.
  def remove_standard
    render json: { item: @item.remove_standard!&.then { |item| serialize(item) } }
  end

  # POST /api/shopping_list_items/1/remove_recipe
  # "✓ op lijst" on a recipe: the recipe part goes, what came from the standard list stays.
  # { "item": line } or, when the line is gone, { "item": null }.
  def remove_recipe
    render json: { item: @item.remove_recipe_part!&.then { |item| serialize(item) } }
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
        render_invalid(item)
      end
    end

    # All or nothing: one invalid item rolls back the ones before it. The errors name
    # the line by its place in the request, counting from 0: "shopping_list_items[2].name",
    # like the nested errors of a recipe ("steps[1].body").
    def create_many(attributes_list)
      if attributes_list.size > MAX_ITEMS_PER_REQUEST
        return render_error :unprocessable_content, I18n.t("api.too_many_items", count: MAX_ITEMS_PER_REQUEST)
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
        errors = failed_item.errors.to_hash.transform_keys { |field| "shopping_list_items[#{failed_index}].#{field}" }
        render_error :unprocessable_content, I18n.t("api.invalid"), errors
      else
        render json: items.map { |item| serialize(item) }, status: :created
      end
    end

    def serialize(item)
      ShoppingListItemSerializer.item(item)
    end
end
