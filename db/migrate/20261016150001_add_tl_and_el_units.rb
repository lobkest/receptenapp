# Theelepel (tl) and eetlepel (el) as units, next to g, ml and stuks. Only the check
# constraints change: existing rows already fit, nothing is converted. Rolling back fails
# while a row still uses tl or el, on purpose: the database never drops amounts by itself.
class AddTlAndElUnits < ActiveRecord::Migration[8.1]
  TABLES = %i[ recipe_ingredients variation_changes shopping_list_items ].freeze
  OLD_UNITS = "('g', 'ml', 'stuks')"
  NEW_UNITS = "('g', 'ml', 'stuks', 'tl', 'el')"

  def up
    replace_unit_constraints(NEW_UNITS)
  end

  def down
    replace_unit_constraints(OLD_UNITS)
  end

  private
    def replace_unit_constraints(units)
      TABLES.each do |table|
        name = "#{table}_unit_known"
        remove_check_constraint table, name: name
        add_check_constraint table, "unit IN #{units}", name: name
      end
    end
end
