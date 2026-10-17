# The standard list (things you buy often). Public, like the shopping list: anyone with the
# link can see and change it. Writes are rate limited (PublicWriteRateLimit).
class Api::StandardItemsController < ApplicationController
  include PublicWriteRateLimit
  limit_public_writes only: %i[ create update destroy bulk_destroy add_to_shopping_list ]

  before_action :set_standard_item, only: %i[ update destroy ]

  # GET /api/standard_items
  def index
    render json: StandardItem.order(:name).map { |item| serialize(item) }
  end

  # POST /api/standard_items
  def create
    @standard_item = StandardItem.new(standard_item_params)
    save_and_render(status: :created)
  end

  # PATCH/PUT /api/standard_items/1
  def update
    @standard_item.assign_attributes(standard_item_params)
    save_and_render(status: :ok)
  end

  # DELETE /api/standard_items/1
  def destroy
    @standard_item.destroy!

    head :no_content
  end

  # POST /api/standard_items/bulk_destroy  { "ids": [1, 2, 3] }
  # All or nothing: one transaction, and destroy! raises if an item cannot be deleted,
  # which rolls back the ones before it. Ids that do not exist are skipped; the response
  # lists the ids that were actually deleted.
  def bulk_destroy
    ids = params.expect(ids: [])

    deleted = StandardItem.transaction { StandardItem.where(id: ids).order(:id).each(&:destroy!) }

    render json: { deleted_ids: deleted.map(&:id) }
  rescue ActiveRecord::RecordNotDestroyed
    render_error :unprocessable_content, I18n.t("api.bulk_destroy_failed")
  end

  # POST /api/standard_items/add_to_shopping_list  { "ids": [1, 2, 3] }
  # Each item once on the shopping list: a new line, or one more on a line that is already
  # there (ShoppingListItem.add_standard!). Ids that do not exist are skipped. Returns the
  # lines that were added or changed, in the order of the item names.
  def add_to_shopping_list
    ids = params.expect(ids: [])

    lines = ShoppingListItem.transaction do
      StandardItem.where(id: ids).order(:name).map { |item| ShoppingListItem.add_standard!(item.name) }
    end

    render json: ShoppingListItemSerializer.items(lines)
  end

  private
    def set_standard_item
      @standard_item = StandardItem.find(params[:id])
    end

    def standard_item_params
      params.expect(standard_item: [ :name, :category ])
    end

    # The unique index also catches two requests that pass the validation at the same time.
    def save_and_render(status:)
      if @standard_item.save
        render json: serialize(@standard_item), status: status
      else
        render_invalid(@standard_item)
      end
    rescue ActiveRecord::RecordNotUnique
      @standard_item.errors.add(:name, :taken)
      render_invalid(@standard_item)
    end

    def serialize(item)
      item.slice("id", "name", "category")
    end
end
