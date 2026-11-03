# The standard list (things you buy often). Public, like the shopping list: anyone with the
# link can see and change it. Writes are rate limited (PublicWriteRateLimit).
class Api::StandardItemsController < ApplicationController
  include PublicWriteRateLimit
  limit_public_writes only: %i[ create update destroy bulk_destroy add_to_shopping_list ]

  before_action :set_standard_item, only: %i[ update destroy ]

  # GET /api/standard_items
  # Temporary items unused for StandardItem::TEMPORARY_LIFETIME are removed first (no
  # scheduled job needed).
  def index
    StandardItem.remove_expired!
    render json: StandardItem.order(:name).map { |item| serialize(item) }
  end

  # POST /api/standard_items  { "standard_item": { "name": "melk", "category": "zuivel", "client_id": "…uuid…" } }
  # client_id (optional): an item with that client_id that is already there is returned as
  # it is, with 200 (an offline change sent twice). See ClientAction for the uuid.
  def create
    client_id = params.dig(:standard_item, :client_id).to_s
    if client_id.match?(ClientAction::UUID) && (existing = StandardItem.find_by(client_id: client_id))
      return render json: serialize(existing)
    end

    @standard_item = StandardItem.new(standard_item_params.merge(client_id: client_id.presence))
    save_and_render(status: :created)
  end

  # PATCH/PUT /api/standard_items/1  { "standard_item": { "name": "melk", "category": "zuivel" } }
  # A temporary item becomes permanent with a category, or with "temporary": false (moved
  # to "Geen categorie"). See StandardItem.
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
  # POST /api/standard_items/add_to_shopping_list  { "names": ["melk"], "client_action_id": "…" }
  # Each item once on the shopping list: a new line, or one more on a line that is already
  # there (ShoppingListItem.add_standard!). Ids that do not exist are skipped. Returns the
  # lines that were added or changed, in the order of the item names.
  # names: for a change made offline, which can name an item that was itself added offline
  # (no id yet). client_action_id: sent again, nothing is added twice (ClientAction).
  def add_to_shopping_list
    names = if params.key?(:names)
      params.expect(names: []).map { |name| name.to_s.squish.downcase }.compact_blank.uniq.sort
    else
      StandardItem.where(id: params.expect(ids: [])).order(:name).pluck(:name)
    end

    lines, _created = ClientAction.once(params[:client_action_id]) do
      ShoppingListItem.transaction { names.map { |name| ShoppingListItem.add_standard!(name) } }
    end

    render json: ShoppingListItemSerializer.items(lines)
  end

  private
    def set_standard_item
      @standard_item = StandardItem.find(params[:id])
    end

    # client_id only on create (see create), never changed afterwards. temporary: only
    # false does something (StandardItem#temporary=).
    def standard_item_params
      params.expect(standard_item: [ :name, :category, :temporary ])
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
      StandardItem.serialize(item)
    end
end
