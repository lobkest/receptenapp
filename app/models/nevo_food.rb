# A product from NEVO-online (RIVM), with only the nutrients the app shows, per 100 g or
# per 100 ml (unit). Imported with bin/rails nevo:import; the app never changes these rows
# (the terms of use do not allow changing NEVO data). nil means unknown, not 0.
class NevoFood < ApplicationRecord
  # The nutrients the app shows, in this order. The same keys as the columns here and the
  # label_* columns of Ingredient, and as the API sends them.
  NUTRIENTS = %w[ kcal protein carbohydrates fat fiber ].freeze
  UNITS = %w[ g ml ].freeze
  MAX_SEARCH_RESULTS = 20

  # An ingredient keeps its row when a newer NEVO version is imported (upsert on code).
  has_many :ingredients, dependent: nil

  validates :code, presence: true, uniqueness: true
  validates :name, :version, presence: true
  validates :unit, inclusion: { in: UNITS }

  # Every word must be in the name or the synonym ("kikker blik"). Best first: a name or
  # synonym that starts with the search, then one with a word that starts with it, then
  # the rest; within that raw products first (a recipe mostly starts from raw), then short
  # names. Like ILIKE in Postgres; \m is "start of a word" in a Postgres regex.
  scope :search, ->(query) {
    words = query.to_s.squish.split(" ").first(5)
    next none if words.empty?

    matches = words.reduce(all) do |scope, word|
      pattern = "%#{sanitize_sql_like(word)}%"
      scope.where("nevo_foods.name ILIKE :pattern OR nevo_foods.synonym ILIKE :pattern", pattern: pattern)
    end

    start = "#{sanitize_sql_like(words.join(' '))}%"
    word_start = "\\m#{Regexp.escape(words.first)}"
    rank = sanitize_sql_array([ <<~SQL.squish, start, start, word_start, word_start ])
      CASE WHEN nevo_foods.synonym ILIKE ? OR nevo_foods.name ILIKE ? THEN 0
           WHEN nevo_foods.synonym ~* ? OR nevo_foods.name ~* ? THEN 1
           ELSE 2 END
    SQL
    matches.order(Arel.sql(rank)).order(Arel.sql("CASE WHEN nevo_foods.name ILIKE '%rauw%' THEN 0 ELSE 1 END"))
      .order(Arel.sql("LENGTH(nevo_foods.name)"), :code).limit(MAX_SEARCH_RESULTS)
  }

  # "NEVO-Online 2025 9.0" → "2025/9.0", as the terms of use want it in the citation.
  def self.citation_version(version)
    version.to_s[/(\d{4})\s+(\d+\.\d+)/] ? "#{$1}/#{$2}" : version.to_s
  end

  # The synonym reads naturally ("Kikkererwten blik/glas"); the official name is the
  # other way round ("Erwten kikker- blik/glas"). Not every product has a synonym.
  def display_name
    synonym.presence || name
  end
end
