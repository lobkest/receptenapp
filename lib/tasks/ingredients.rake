# Ingrediënten opschonen volgens db/import/ingredient_cleanup.yml.
#
#   bin/rails ingredients:cleanup DRY_RUN=1
#
# De stand bekijken zonder iets te schrijven: script/export_ingredients.rb.
namespace :ingredients do
  database = lambda do
    config = ActiveRecord::Base.connection_db_config
    puts "Database: #{config.database} (#{config.host || 'localhost'}), omgeving #{Rails.env}"
  end

  desc "Ingrediënten opschonen volgens db/import/ingredient_cleanup.yml [DRY_RUN=1]"
  task cleanup: :environment do
    database.call
    puts Importers::IngredientCleanup.from_file(Rails.root.join("db/import/ingredient_cleanup.yml"), dry_run: ENV["DRY_RUN"] == "1")
  end
end
