# A standard item can be linked by hand to an ingredient with another name ("uien" is the
# ingredient "ui"), so the house and "✓ op lijst" work for it. ingredient_id: NULL = not
# linked (matched by name, as before); deleting the ingredient unlinks the item.
#
# standard_item_link_rejections: "nee, niet hetzelfde" for a suggested pair, so the pair is
# not suggested again. Goes with either side.
class AddIngredientLinksToStandardItems < ActiveRecord::Migration[8.1]
  def change
    add_reference :standard_items, :ingredient, foreign_key: { on_delete: :nullify }, index: true

    create_table :standard_item_link_rejections do |t|
      t.references :standard_item, null: false, foreign_key: { on_delete: :cascade }, index: false
      t.references :ingredient, null: false, foreign_key: { on_delete: :cascade }
      t.timestamps
    end
    add_index :standard_item_link_rejections, %i[ standard_item_id ingredient_id ], unique: true,
      name: "index_standard_item_link_rejections_on_pair"
  end
end
