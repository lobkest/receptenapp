# A change from the browser that the server works out itself ("Alles op lijst", a standard
# item or a loose item on the shopping list), remembered by the uuid the browser gave it
# (client_action_id). An offline change can arrive twice: the connection dropped after the
# server saved it, so the browser sends it again. The second time nothing is added; the
# lines of the first time come back instead.
#
#   ClientAction.once(params[:client_action_id]) { ShoppingListItem.add_standard!("melk") }
#   # => [ lines, true ] the first time, [ the same lines as they are now, false ] after that
#
# id is the uuid itself. item_ids: the ShoppingListItems the change returned. Rows older
# than KEEP are deleted now and then: an offline change waits days, not months.
class ClientAction < ApplicationRecord
  KEEP = 30.days

  # uuid in any case, with dashes; anything else is not a client action id.
  UUID = /\A\h{8}-\h{4}-\h{4}-\h{4}-\h{12}\z/

  # Runs the block (which returns the ShoppingListItems it made or changed) and remembers
  # it under id, in one transaction. Without a (valid) id it just runs the block. Returns
  # [ items, new? ]. Two requests with the same id at the same time: the unique primary key
  # makes the second wait for the first and then fail, so it returns the first one's lines.
  def self.once(id)
    return [ yield, true ] unless id.to_s.match?(UUID)

    existing = find_by(id: id)
    return [ items_of(existing), false ] if existing

    # requires_new: a savepoint, so a duplicate id leaves an outer transaction usable.
    items = transaction(requires_new: true) do
      record = create!(id: id)
      yield.tap { |lines| record.update!(item_ids: lines.map(&:id)) }
    end
    where(created_at: ...KEEP.ago).delete_all
    [ items, true ]
  rescue ActiveRecord::RecordNotUnique
    [ items_of(find(id)), false ]
  end

  # The lines as they are now; a line that is gone since (ticked off and cleared) is left out.
  def self.items_of(action)
    ShoppingListItem.where(id: action.item_ids).order(:id).to_a
  end
  private_class_method :items_of
end
