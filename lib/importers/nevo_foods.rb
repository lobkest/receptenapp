require "csv"

# Reads the NEVO-online csv (RIVM) and stores every product with only the nutrients the
# app shows (NevoFood::NUTRIENTS). Upsert on the NEVO code: running it again, also with a
# newer NEVO version, updates the rows in place, so links from ingredients stay.
#
#   Importers::NevoFoods.from_file("/pad/naar/NEVO2025_v9.0.csv")  # => Result
#
# The file: UTF-8, "|" between fields, a header row, a decimal comma ("0,3"), and an empty
# field for an unknown value. That stays nil (unknown), never 0.
module Importers
  class NevoFoods
    # A file that is not what we expect: the import stops before writing anything.
    class InvalidFile < StandardError; end

    # Column in the NEVO file → attribute of NevoFood.
    COLUMNS = {
      "NEVO-code" => :code,
      "Voedingsmiddelnaam/Dutch food name" => :name,
      "Synoniem" => :synonym,
      "Hoeveelheid/Quantity" => :unit,
      "NEVO-versie/NEVO-version" => :version,
      "ENERCC (kcal)" => :kcal,
      "PROT (g)" => :protein,
      "CHO (g)" => :carbohydrates,
      "FAT (g)" => :fat,
      "FIBT (g)" => :fiber
    }.freeze
    UNITS = { "per 100g" => "g", "per 100ml" => "ml" }.freeze
    NUMBER = /\A-?\d+(,\d+)?\z/

    Result = Data.define(:created, :updated, :versions) do
      def to_s
        "#{versions.join(', ')}: #{created + updated} producten (#{created} nieuw, #{updated} bijgewerkt)."
      end
    end

    def self.from_file(path)
      new(path).call
    end

    def initialize(path)
      @path = path
    end

    def call
      rows = read
      existing = NevoFood.where(code: rows.map { |row| row[:code] }).count

      NevoFood.transaction do
        rows.each_slice(500) { |slice| NevoFood.upsert_all(slice, unique_by: :code) }
      end
      Result.new(created: rows.size - existing, updated: existing, versions: rows.map { |row| row[:version] }.uniq)
    end

    private
      # Everything is checked first, so a bad file changes nothing.
      def read
        table = CSV.read(@path, col_sep: "|", headers: true, encoding: "bom|utf-8")
        missing = COLUMNS.keys - table.headers
        raise InvalidFile, "kolommen ontbreken: #{missing.join(', ')}" if missing.any?
        raise InvalidFile, "het bestand bevat geen producten" if table.empty?

        rows = table.each.with_index(2).map { |row, line| attributes(row, line) }
        doubles = rows.map { |row| row[:code] }.tally.select { |_, count| count > 1 }.keys
        raise InvalidFile, "dubbele NEVO-codes: #{doubles.join(', ')}" if doubles.any?

        rows
      rescue CSV::MalformedCSVError, Errno::ENOENT => error
        raise InvalidFile, error.message
      end

      def attributes(row, line)
        values = COLUMNS.to_h { |column, attribute| [ attribute, row[column].to_s.strip ] }
        code = Integer(values[:code], 10, exception: false) or raise InvalidFile, "regel #{line}: ongeldige NEVO-code #{values[:code].inspect}"
        unit = UNITS[values[:unit].squish] or raise InvalidFile, "regel #{line}: onbekende hoeveelheid #{values[:unit].inspect}"
        raise InvalidFile, "regel #{line}: naam of versie ontbreekt" if values[:name].empty? || values[:version].empty?

        nutrients = NevoFood::NUTRIENTS.to_h { |nutrient| [ nutrient.to_sym, number(values[nutrient.to_sym], line) ] }
        { code: code, name: values[:name], synonym: values[:synonym].presence, unit: unit, version: values[:version], **nutrients }
      end

      # "1,5" → 1.5; empty → nil (unknown).
      def number(value, line)
        return if value.empty?
        raise InvalidFile, "regel #{line}: ongeldig getal #{value.inspect}" unless value.match?(NUMBER)

        BigDecimal(value.tr(",", "."))
      end
  end
end
