# One-off switch to automatic tags (vegetarisch, veganistisch, glutenvrij, lactosevrij),
# for bin/rails traits:setup. In one transaction:
#
# 1. every ingredient that a variation adds by name becomes an Ingredient, so it can have
#    traits (new additions do that themselves, see VariationChange);
# 2. ingredients without traits that nobody checked get the suggestion from the YAML file
#    (db/import/ingredient_traits.yml), still unchecked (traits_checked false);
# 3. the tags set by hand are compared with the worked-out ones, and the differences
#    (recipe, tag, by hand, worked out) go to the report file (tmp/tag_verschillen.txt);
# 4. the links by hand to automatic tags go: recipe_tags, and the tag changes of variations.
#
#   puts Importers::TraitsSetup.from_file("db/import/ingredient_traits.yml", report_path: "tmp/tag_verschillen.txt", dry_run: true)
#
# Running it again changes nothing: checked ingredients and ones that already have traits
# stay as they are, and the links by hand are gone after the first run. With dry_run
# everything is rolled back, but the report file is still written.
module Importers
  class TraitsSetup
    Difference = Data.define(:recipe, :tag, :manual, :computed, :reason)

    def self.from_file(path, report_path:, dry_run: false)
      new(YAML.safe_load_file(path), report_path: report_path, dry_run: dry_run).call
    end

    def initialize(suggestions, report_path:, dry_run:)
      @suggestions = suggestions.to_h do |name, value|
        traits, doubt = value.is_a?(Hash) ? [ value["traits"], value["twijfel"] ] : [ value, nil ]
        [ Ingredient.normalize_value_for(:name, name), [ Array(traits), doubt ] ]
      end
      @report_path = report_path
      @dry_run = dry_run
    end

    def call
      lines = []
      # requires_new: inside another transaction (a test) Rollback would otherwise do nothing.
      ApplicationRecord.transaction(requires_new: true) do
        check_trait_names!
        created = create_addition_ingredients
        classified = classify
        differences = compare
        removed = remove_manual_links

        # A second run has nothing left to compare: then the first report stays.
        File.write(@report_path, differences_report(differences)) if @compared.any?
        lines = report(created, classified, differences, removed)
        raise ActiveRecord::Rollback if @dry_run
      end
      lines.join("\n")
    end

    private
      def check_trait_names!
        unknown = @suggestions.values.flat_map(&:first).uniq - Trait.pluck(:name)
        raise ArgumentError, "Onbekende kenmerken in het bestand: #{unknown.join(', ')}" if unknown.any?
      end

      def create_addition_ingredients
        names = VariationChange.kind_add.distinct.pluck(:name) - Ingredient.pluck(:name)
        names.each { |name| Ingredient.create!(name: name) }
        names.sort
      end

      # [ [ name, traits or nil (no suggestion), doubt, status ] ] for every ingredient.
      def classify
        traits = Trait.all.index_by(&:name)
        Ingredient.includes(:traits).order(:name).map do |ingredient|
          suggestion, doubt = @suggestions[ingredient.name]
          if ingredient.traits_checked || ingredient.traits.any?
            [ ingredient.name, ingredient.traits.map(&:name), nil, "al ingesteld" ]
          elsif suggestion.nil?
            [ ingredient.name, nil, nil, "geen voorstel" ]
          else
            ingredient.traits = suggestion.map { |name| traits.fetch(name) }
            [ ingredient.name, suggestion, doubt, "voorgesteld" ]
          end
        end
      end

      # By hand: the recipe has the tag (recipe_tags); for a variation, the recipe's tag
      # with its own changes. Worked out: RecipeTagEvaluator. Only where they differ in
      # "has the tag" (ja and met_wissel both count as having it), and only for tags that
      # were used by hand at all: a tag that is new (no recipe had it) has nothing to compare.
      # A variation is only named when it differs in another way than its recipe.
      def compare
        evaluator = RecipeTagEvaluator.load
        @compared = Tag.automatic.where(id: RecipeTag.select(:tag_id)).or(Tag.automatic.where(id: VariationTagChange.select(:tag_id)))
          .order(:name).pluck(:name)
        recipes = Recipe.includes(:tags, RecipeTagEvaluator::PRELOAD, variations: RecipeVariation::DETAILS)
          .sort_by { |recipe| [ recipe.title.downcase, recipe.id ] }
        ingredients = Ingredient.for_additions(recipes.flat_map(&:variations))

        recipes.flat_map do |recipe|
          base = evaluator.for_recipe(recipe).select { |result| @compared.include?(result.name) }.index_by { |result| result.name }
          manual = recipe.tags.map(&:name)
          differences = base.values.filter_map { |result| difference(recipe.title, manual.include?(result.name), result) }

          recipe.variations.each do |variation|
            changes = variation.tag_changes.group_by(&:kind).transform_values { |list| list.map { |change| change.tag.name } }
            evaluator.for_variation(variation, recipe: recipe, ingredients: ingredients).each do |result|
              name = result.name
              next unless base.key?(name)

              by_hand = changes.fetch("add", []).include?(name) || (manual.include?(name) && !changes.fetch("remove", []).include?(name))
              next if by_hand == manual.include?(name) && result.passes? == base[name].passes?

              differences << difference("#{recipe.title} (variatie: #{variation.name})", by_hand, result)
            end
          end
          differences.compact
        end
      end

      def difference(recipe, manual, result)
        return if manual == result.passes?

        Difference.new(recipe: recipe, tag: result.name, manual: manual ? "ja" : "nee",
          computed: result.status, reason: reason(result))
      end

      def reason(result)
        return "door #{result.blockers.join(', ')}" if result.status == "nee"

        hints = result.swaps.map { |swap| "met #{swap.alternatives.map(&:name).join(' of ')} i.p.v. #{swap.ingredient}" }
        hints += result.without.map { |skip| "zonder #{skip.ingredient}" }
        hints.join(", ").presence
      end

      def remove_manual_links
        automatic = Tag.automatic.select(:id)
        { "recepten" => RecipeTag.where(tag_id: automatic).delete_all,
          "variaties" => VariationTagChange.where(tag_id: automatic).delete_all }
      end

      def differences_report(differences)
        header = [
          "Verschillen tussen de tags met de hand en de automatisch berekende tags.",
          "Berekend: ja, met_wissel (alleen met een alternatief) of nee. Gemaakt op #{Time.current.in_time_zone('Europe/Amsterdam').strftime('%d-%m-%Y %H:%M')}.",
          "Vergeleken: #{@compared.join(', ')}. De andere automatische tags waren nergens met de hand gezet.",
          "Recept | tag | handmatig | berekend | waarom",
          ""
        ]
        rows = differences.map { |row| [ row.recipe, row.tag, row.manual, row.computed, row.reason ].compact.join(" | ") }
        (header + (rows.presence || [ "Geen verschillen." ]) + [ "", "Totaal: #{differences.size} verschillen." ]).join("\n") + "\n"
      end

      def report(created, classified, differences, removed)
        suggested = classified.select { |row| row[3] == "voorgesteld" }
        lines = [ (@dry_run ? "DRY RUN: alles is teruggedraaid, er is niets opgeslagen (alleen het verschillenbestand)." : nil) ]
        lines << "Nieuwe ingrediënten uit variaties: #{created.join(', ')}" if created.any?
        lines << "Voorgesteld (nog te controleren):"
        suggested.reject { |row| row[2] }.each { |name, traits| lines << "  #{name} → #{traits_text(traits)}" }
        lines << "Twijfelgevallen:"
        suggested.select { |row| row[2] }.each { |name, traits, doubt| lines << "  #{name} → #{traits_text(traits)} (#{doubt})" }
        classified.select { |row| row[3] == "geen voorstel" }.each { |name, *| lines << "  #{name} → geen voorstel" }
        counts = classified.group_by(&:last).transform_values(&:size).map { |status, count| "#{count} #{status}" }
        lines << "Ingrediënten: #{counts.join(', ')}."
        lines << (@compared.any? ? "Verschillen: #{differences.size}, zie #{@report_path}." :
          "Geen handmatige automatische tags meer om te vergelijken; #{@report_path} is niet aangepast.")
        lines << "Handmatige koppelingen met automatische tags verwijderd: #{removed.map { |where, count| "#{count} bij #{where}" }.join(', ')}."
        lines.compact
      end

      def traits_text(traits)
        traits.empty? ? "geen" : traits.join(", ")
      end
  end
end
