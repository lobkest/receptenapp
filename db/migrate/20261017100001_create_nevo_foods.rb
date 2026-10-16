# Products from NEVO-online (RIVM): name, synonym and only the nutrients the app shows,
# per 100 g or per 100 ml (unit). Filled by bin/rails nevo:import, never by hand: the
# terms of use do not allow changing NEVO data. A missing value stays NULL (unknown, not 0).
class CreateNevoFoods < ActiveRecord::Migration[8.1]
  def change
    create_table :nevo_foods do |t|
      t.integer :code, null: false
      t.string :name, null: false
      t.string :synonym
      t.string :unit, null: false
      t.string :version, null: false
      t.decimal :kcal, precision: 10, scale: 2
      t.decimal :protein, precision: 10, scale: 2
      t.decimal :carbohydrates, precision: 10, scale: 2
      t.decimal :fat, precision: 10, scale: 2
      t.decimal :fiber, precision: 10, scale: 2
      t.timestamps
    end
    add_index :nevo_foods, :code, unique: true
    add_check_constraint :nevo_foods, "unit IN ('g', 'ml')", name: "nevo_foods_unit_known"
  end
end
