# false: the traits are a suggestion (or still empty) that nobody has looked at yet.
# "Gecontroleerd" on the ingredients page sets it.
class AddTraitsCheckedToIngredients < ActiveRecord::Migration[8.1]
  def change
    add_column :ingredients, :traits_checked, :boolean, default: false, null: false
  end
end
