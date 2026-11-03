# "Tijdelijk" on the standard list: an item typed loose on the shopping list ("Iets
# toevoegen…") also lands on the standard list, under "Tijdelijk". Not a category but a
# property of the item: temporary_last_used_at is when it was last put on the shopping list;
# NULL = a permanent item. After StandardItem::TEMPORARY_LIFETIME without use it is removed
# (StandardItem.remove_expired!, when the standard list is fetched).
#
# Once: the loose lines that are open on the shopping list now also go under "Tijdelijk"
# (unless the name is already on the standard list), used now. Plain SQL, so the migration
# does not depend on the models as they will be later.
class AddTemporaryLastUsedAtToStandardItems < ActiveRecord::Migration[8.1]
  def up
    add_column :standard_items, :temporary_last_used_at, :datetime
    add_index :standard_items, :temporary_last_used_at

    # Names on the list are already squished and lower case (normalize_fields); trim and
    # lower again for safety. ON CONFLICT: the unique index on name.
    execute <<~SQL
      INSERT INTO standard_items (name, temporary_last_used_at, created_at, updated_at)
      SELECT DISTINCT lower(btrim(name)), now(), now(), now()
      FROM shopping_list_items
      WHERE source_label = 'los' AND checked = false AND btrim(name) <> ''
      ON CONFLICT (name) DO NOTHING
    SQL
  end

  def down
    execute "DELETE FROM standard_items WHERE temporary_last_used_at IS NOT NULL"
    remove_index :standard_items, :temporary_last_used_at
    remove_column :standard_items, :temporary_last_used_at
  end
end
