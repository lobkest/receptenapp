# Offline changes are sent later, sometimes twice (the connection drops after the server
# saved but before the answer came back). The browser gives each change its own uuid, so
# the second time the server recognises it instead of adding a line twice.
#
# client_id: the uuid of the change that created this row (nullable: rows made online
# before this, or by an older app). client_actions: changes that the server works out
# itself ("Alles op lijst", a standard item or a loose item on the list may add lines or
# raise a count); item_ids are the lines it returned, so a repeat returns them again.
class AddClientIdsForOfflineSync < ActiveRecord::Migration[8.1]
  def change
    add_column :shopping_list_items, :client_id, :uuid
    add_index :shopping_list_items, :client_id, unique: true
    add_column :standard_items, :client_id, :uuid
    add_index :standard_items, :client_id, unique: true

    create_table :client_actions, id: :uuid do |t|
      t.bigint :item_ids, array: true, null: false, default: []
      t.timestamps
    end
    add_index :client_actions, :created_at
  end
end
