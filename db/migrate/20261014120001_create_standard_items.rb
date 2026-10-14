class CreateStandardItems < ActiveRecord::Migration[8.1]
  def change
    create_table :standard_items do |t|
      t.string :name, null: false
      t.string :category # NULL means "overig"
      t.timestamps
    end

    # Names are stored normalized (see StandardItem), so a plain unique index is enough.
    add_index :standard_items, :name, unique: true
  end
end
