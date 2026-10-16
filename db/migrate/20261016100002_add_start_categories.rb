# The first four categories. Plain SQL instead of the Category model, so this migration
# still runs when the model changes later. Idempotent: an existing name (in any case) is
# left alone, so running it twice, or after someone made "ontbijt" by hand, adds nothing.
class AddStartCategories < ActiveRecord::Migration[8.1]
  CATEGORIES = { "Ontbijt" => 1, "Lunch" => 2, "Diner" => 3, "Snacks" => 4 }.freeze

  def up
    CATEGORIES.each do |name, position|
      execute <<~SQL.squish
        INSERT INTO categories (name, position, created_at, updated_at)
        VALUES (#{quote(name)}, #{Integer(position)}, NOW(), NOW())
        ON CONFLICT ((lower(name))) DO NOTHING
      SQL
    end
  end

  # Only removes the four when no recipe uses them; categories made later stay.
  def down
    names = CATEGORIES.keys.map { |name| quote(name.downcase) }.join(", ")
    execute <<~SQL.squish
      DELETE FROM categories
      WHERE lower(name) IN (#{names})
        AND NOT EXISTS (SELECT 1 FROM recipes WHERE recipes.category_id = categories.id)
    SQL
  end

  private
    def quote(value)
      connection.quote(value)
    end
end
