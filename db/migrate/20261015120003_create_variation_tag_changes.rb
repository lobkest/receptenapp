# A tag that a variation adds to or takes off the base recipe ("+ vis", "− vega").
class CreateVariationTagChanges < ActiveRecord::Migration[8.1]
  def change
    create_table :variation_tag_changes do |t|
      # No separate index: the unique index below starts with recipe_variation_id.
      t.references :recipe_variation, null: false, foreign_key: { on_delete: :cascade }, index: false
      t.references :tag, null: false, foreign_key: true
      t.string :kind, null: false
      t.timestamps
    end

    add_index :variation_tag_changes, [ :recipe_variation_id, :tag_id ], unique: true
    add_check_constraint :variation_tag_changes, "kind IN ('add', 'remove')", name: "variation_tag_changes_kind_known"
  end
end
