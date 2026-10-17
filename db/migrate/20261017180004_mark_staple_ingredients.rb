# The first basisvoorraad. Plain SQL on the name instead of the Ingredient model, like
# AddStartCategories, so this still runs when the model changes later. A name that does
# not exist is simply not found. Idempotent: running it again changes nothing.
#
# The same list is in db/seeds.rb, for a database made from db/schema.rb.
class MarkStapleIngredients < ActiveRecord::Migration[8.1]
  NAMES = [ "zout", "peper", "olijfolie", "suiker", "bloem", "balsamicoazijn", "paprikapoeder",
    "italiaanse kruiden", "water" ].freeze

  def up
    count = connection.exec_update(<<~SQL.squish)
      UPDATE ingredients SET staple = TRUE, updated_at = NOW()
      WHERE staple = FALSE AND name IN (#{NAMES.map { |name| connection.quote(name) }.join(", ")})
    SQL
    say "#{count} ingrediënten zijn basisvoorraad geworden"
  end

  # Nothing to undo: which ones were staple before is not kept, and rolling back further
  # removes the column (AddStapleToIngredients).
  def down
  end
end
