class CreateSteps < ActiveRecord::Migration[8.1]
  def change
    create_table :steps do |t|
      # No separate index: the unique constraint below starts with recipe_id and covers lookups.
      t.references :recipe, null: false, foreign_key: true, index: false
      t.integer :position, null: false
      t.text :body, null: false
      t.timestamps
    end

    # Deferred: checked at commit, so steps can swap positions within one transaction.
    add_unique_constraint :steps, [ :recipe_id, :position ], deferrable: :deferred,
      name: "steps_recipe_id_position_unique"
    add_check_constraint :steps, "position > 0", name: "steps_position_positive"
  end
end
