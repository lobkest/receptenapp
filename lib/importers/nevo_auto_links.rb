# Links existing ingredients to a NEVO product once, from a YAML file of chosen matches
# (db/import/nevo_auto_links.yml), and marks each as "te controleren" (needs_review).
# An ingredient that is already linked is left alone, so running it again changes nothing
# and never undoes a link chosen in the app. New ingredients only get suggestions in the app.
#
#   puts Importers::NevoAutoLinks.from_file("db/import/nevo_auto_links.yml", dry_run: true)
#
# Conversions are only filled in where the ingredient is used that way (stuks, or
# ml/tl/el, in a recipe or a variation) and only when still empty.
module Importers
  class NevoAutoLinks
    Row = Data.define(:name, :status, :nevo, :conversion, :note)

    def self.from_file(path, dry_run: false)
      new(YAML.safe_load_file(path), dry_run: dry_run).call
    end

    def initialize(links, dry_run:)
      @links = links.transform_keys { |name| Ingredient.normalize_value_for(:name, name) }
      @dry_run = dry_run
    end

    def call
      rows = []
      # requires_new: inside another transaction (a test) Rollback would otherwise do nothing.
      ApplicationRecord.transaction(requires_new: true) do
        foods = NevoFood.where(code: @links.values.map { |link| link["code"] }).index_by(&:code)
        units = units_in_use

        rows = Ingredient.includes(:nevo_food).order(:name).map { |ingredient| link(ingredient, foods, units[ingredient.name]) }
        raise ActiveRecord::Rollback if @dry_run
      end
      report(rows)
    end

    private
      def link(ingredient, foods, units)
        settings = @links[ingredient.name]
        return Row.new(ingredient.name, "al gekoppeld", ingredient.nevo_food.display_name, conversion(ingredient), nil) if ingredient.nevo_food
        return Row.new(ingredient.name, "geen match", nil, nil, nil) unless settings

        food = foods[settings["code"]]
        return Row.new(ingredient.name, "NEVO-code #{settings['code']} ontbreekt", nil, nil, nil) unless food

        ingredient.nevo_food = food
        ingredient.needs_review = true
        ingredient.grams_per_piece ||= settings["grams_per_piece"] if units&.include?("stuks")
        ingredient.grams_per_ml ||= settings["grams_per_ml"] if units&.intersect?(Ingredient::ML_PER_UNIT.keys)
        ingredient.save!
        Row.new(ingredient.name, "gekoppeld", "#{food.display_name} (#{food.code})", conversion(ingredient), settings["note"])
      end

      # { "ei" => [ "stuks" ] }: the units each ingredient is used with, also in variations.
      def units_in_use
        rows = RecipeIngredient.joins(:ingredient).where.not(unit: nil).distinct.pluck("ingredients.name", :unit)
        rows += VariationChange.kind_add.where.not(unit: nil).distinct.pluck(:name, :unit)
        rows.group_by(&:first).transform_values { |pairs| pairs.map(&:last).uniq }
      end

      def conversion(ingredient)
        [ ingredient.grams_per_piece && "#{number(ingredient.grams_per_piece)} g/stuk",
          ingredient.grams_per_ml && "#{number(ingredient.grams_per_ml)} g/ml" ].compact.join(", ").presence
      end

      def number(decimal)
        decimal.to_s("F").delete_suffix(".0").tr(".", ",")
      end

      def report(rows)
        lines = rows.map do |row|
          "  #{row.name} → #{[ row.status, row.nevo, row.conversion, row.note && "let op: #{row.note}" ].compact.join(' | ')}"
        end
        counts = rows.group_by(&:status).transform_values(&:size).map { |status, count| "#{count} #{status}" }
        [ (@dry_run ? "DRY RUN: alles is teruggedraaid, er is niets opgeslagen." : nil), *lines, "Totaal: #{counts.join(', ')}." ]
          .compact.join("\n")
      end
  end
end
