# Data importeren via de models (validaties en versiegeschiedenis werken mee).
#
#   bin/rails import:standard_items FILE=db/import/standaardlijst.json DRY_RUN=1
#   bin/rails import:recipes FILE=db/import/recepten.json DRY_RUN=1
#
# DRY_RUN=1: alles gebeurt in een transactie die aan het eind wordt teruggedraaid.
# Twee keer draaien is veilig: wat al bestaat, wordt overgeslagen.
namespace :import do
  run = lambda do |importer|
    file = ENV["FILE"].presence or abort "Geef het bestand op: FILE=pad/naar/bestand.json"
    config = ActiveRecord::Base.connection_db_config

    puts "Database: #{config.database} (#{config.host || 'localhost'}), omgeving #{Rails.env}"
    puts importer.from_file(file, dry_run: ENV["DRY_RUN"] == "1")
  end

  desc "Standaardlijst importeren: FILE=db/import/standaardlijst.json [DRY_RUN=1]"
  task standard_items: :environment do
    run.call(Importers::StandardItems)
  end

  desc "Recepten importeren: FILE=db/import/recepten.json [DRY_RUN=1]"
  task recipes: :environment do
    run.call(Importers::Recipes)
  end
end
