class CreateTags < ActiveRecord::Migration[8.1]
  def change
    create_table :tags do |t|
      t.string :name, null: false
      t.timestamps
    end
    # Names are stored normalized (see Tag), so a plain unique index is enough.
    add_index :tags, :name, unique: true
  end
end
