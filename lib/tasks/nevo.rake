# Voedingswaarden uit NEVO-online (RIVM). De NEVO-bestanden staan niet in de repo.
#
#   bin/rails nevo:import FILE=/pad/naar/NEVO2025_v9.0.csv
#   bin/rails nevo:auto_link [DRY_RUN=1]
#
# nevo:import: alle producten, alleen de gekozen voedingsstoffen. Upsert op NEVO-code, dus
# opnieuw draaien (ook met een nieuwe NEVO-versie) is veilig en koppelingen blijven staan.
# nevo:auto_link: eenmalig de bestaande ingrediënten koppelen volgens
# db/import/nevo_auto_links.yml; al gekoppelde ingrediënten blijven zoals ze zijn.
namespace :nevo do
  database = lambda do
    config = ActiveRecord::Base.connection_db_config
    puts "Database: #{config.database} (#{config.host || 'localhost'}), omgeving #{Rails.env}"
  end

  desc "NEVO-producten importeren: FILE=/pad/naar/NEVO2025_v9.0.csv"
  task import: :environment do
    file = ENV["FILE"].presence or abort "Geef het bestand op: FILE=/pad/naar/NEVO2025_v9.0.csv"
    database.call
    puts Importers::NevoFoods.from_file(file)
  rescue Importers::NevoFoods::InvalidFile => error
    abort "Niet geïmporteerd: #{error.message}"
  end

  desc "Bestaande ingrediënten eenmalig aan NEVO koppelen [DRY_RUN=1]"
  task auto_link: :environment do
    database.call
    abort "Eerst nevo:import draaien: er zijn nog geen NEVO-producten." if NevoFood.none?
    puts Importers::NevoAutoLinks.from_file(Rails.root.join("db/import/nevo_auto_links.yml"), dry_run: ENV["DRY_RUN"] == "1")
  end
end
