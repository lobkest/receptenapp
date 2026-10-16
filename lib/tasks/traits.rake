# Eenmalig overstappen op automatische tags (vegetarisch, veganistisch, glutenvrij,
# lactosevrij), volgens db/import/ingredient_traits.yml.
#
#   bin/rails traits:setup DRY_RUN=1
#
# Stelt kenmerken voor bij de bestaande ingrediënten (nog te controleren), schrijft de
# verschillen tussen de handmatige en de berekende tags naar tmp/tag_verschillen.txt en
# haalt daarna de handmatige koppelingen met automatische tags weg. Zie lib/importers/traits_setup.rb.
namespace :traits do
  desc "Kenmerken voorstellen en handmatige automatische tags opruimen [DRY_RUN=1]"
  task setup: :environment do
    config = ActiveRecord::Base.connection_db_config
    puts "Database: #{config.database} (#{config.host || 'localhost'}), omgeving #{Rails.env}"
    puts Importers::TraitsSetup.from_file(Rails.root.join("db/import/ingredient_traits.yml"),
      report_path: Rails.root.join(ENV.fetch("REPORT", "tmp/tag_verschillen.txt")), dry_run: ENV["DRY_RUN"] == "1")
  end
end
