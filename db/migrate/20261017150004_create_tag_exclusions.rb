# The traits a tag excludes: vegetarisch excludes vlees and vis. A tag with at least one
# exclusion is automatic: it is worked out from the ingredients, never set by hand.
class CreateTagExclusions < ActiveRecord::Migration[8.1]
  def change
    create_table :tag_exclusions do |t|
      # No separate tag_id index: the unique index below starts with it.
      t.references :tag, null: false, foreign_key: { on_delete: :cascade }, index: false
      t.references :trait, null: false, foreign_key: { on_delete: :cascade }
      t.timestamps
    end

    add_index :tag_exclusions, [ :tag_id, :trait_id ], unique: true
  end
end
