# The one shared shopping list. Public: anyone with the link can see and change it, from
# any device. Writes are rate limited (PublicWriteRateLimit).
class Api::ShoppingListItemsController < ApplicationController
  include PublicWriteRateLimit
  limit_public_writes only: %i[ create add update destroy remove_recipe destroy_recipe clear_checked clear_all ]

  # "Alles op lijst" for a big recipe is a few dozen; this only stops absurd requests.
  MAX_ITEMS_PER_REQUEST = 100
  ITEM_FIELDS = %i[ name quantity unit source_label recipe_id checked client_id ].freeze

  before_action :set_item, only: %i[ update destroy remove_recipe ]

  # GET /api/shopping_list_items
  def index
    render json: ShoppingListItemSerializer.items(ShoppingListItem.order(:id).to_a)
  end

  # POST /api/shopping_list_items  { "shopping_list_item": { "name": "melk", ... } }
  # POST /api/shopping_list_items  { "shopping_list_items": [ { "name": "melk", ... }, ... ] }
  #
  # Every item becomes its own line, also when the same name and unit is already on the list:
  # each line keeps its own source_label and recipe_id. One item returns that item; several
  # return the new lines in the order they were sent.
  # client_id (a uuid from the browser, optional): a line with that client_id that is already
  # there is returned as it is instead of added again (an offline change sent twice). Status
  # 201 when anything was added, 200 when everything was already there.
  def create
    if params.key?(:shopping_list_items)
      create_many(params.expect(shopping_list_items: [ ITEM_FIELDS ]))
    else
      create_one(params.expect(shopping_list_item: ITEM_FIELDS))
    end
  rescue ActiveRecord::RecordNotUnique
    # The same client_id at the same moment from a second request: now it is there.
    raise if @retried

    @retried = true
    retry
  end

  # POST /api/shopping_list_items/add  { "name": "uien", "count": 3, "ingredient_id": 12 }
  # A loose item typed on the list (ShoppingListItem.add_loose!): with ingredient_id when a
  # suggestion was picked, without it free text. client_action_id: see ClientAction. Returns
  # the line in a list ([] when a repeated action's line is gone since), like "op lijst".
  def add
    fields = params.permit(:name, :ingredient_id, :count, :checked)
    ingredient = fields[:ingredient_id].presence && Ingredient.find(fields[:ingredient_id])

    items, created = ClientAction.once(params[:client_action_id]) do
      [ ShoppingListItem.add_loose!(name: fields[:name], ingredient: ingredient, count: fields.fetch(:count, 1),
        checked: boolean_param(fields[:checked])) ]
    end
    render json: ShoppingListItemSerializer.items(items), status: created ? :created : :ok
  end

  # PATCH/PUT /api/shopping_list_items/1  { "shopping_list_item": { "checked": true } }
  # PATCH/PUT /api/shopping_list_items/1  { "shopping_list_item": { "count": 3 } }  (the stepper)
  def update
    if @item.update(params.expect(shopping_list_item: %i[ checked name count ]))
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

  # POST /api/shopping_list_items/1/remove_recipe
  # "✓ op lijst" on a recipe: the recipe part goes, what came from the standard list stays.
  # { "item": line } or, when the line is gone, { "item": null }.
  def remove_recipe
    render json: { item: @item.remove_recipe_part!&.then { |item| serialize(item) } }
  end

  # DELETE /api/shopping_list_items?recipe_id=5
  # DELETE /api/shopping_list_items?source_label=Pannenkoeken  (a deleted recipe)
  # "Verwijder" in "Recepten op je lijst": every open line of the recipe in one transaction;
  # a line also added from the standard list stays as a standard line (like "✓ op lijst").
  # { "removed_ids": [ 1, 2 ], "items": [ the lines that stayed ] }
  def destroy_recipe
    removed_ids, kept = if params[:recipe_id].present?
      ShoppingListItem.remove_recipe!(recipe_id: params[:recipe_id])
    else
      ShoppingListItem.remove_recipe!(source_label: params.expect(:source_label))
    end

    render json: { removed_ids: removed_ids, items: ShoppingListItemSerializer.items(kept) }
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

    # Only a real uuid: an invalid one would be cast to nil and match a line without client_id.
    def existing_line(attributes)
      client_id = attributes[:client_id].to_s
      ShoppingListItem.find_by(client_id: client_id) if client_id.match?(ClientAction::UUID)
    end

    def create_one(attributes)
      if (existing = existing_line(attributes))
        return render json: serialize(existing)
      end

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
      added = false
      items = ShoppingListItem.transaction do
        attributes_list.each_with_index.map do |attributes, index|
          existing = existing_line(attributes)
          next existing if existing

          added = true
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
        render json: ShoppingListItemSerializer.items(items), status: added ? :created : :ok
      end
    end

    def serialize(item)
      ShoppingListItemSerializer.item(item)
    end
end
