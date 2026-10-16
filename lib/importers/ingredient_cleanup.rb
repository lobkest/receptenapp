# A one-off cleanup of the ingredients, from decisions in a YAML file that a person can
# read first (db/import/ingredient_cleanup.yml). bin/rails ingredients:cleanup [DRY_RUN=1].
#
# In this order, everything in one transaction (dry_run rolls it back, but prints it all):
# 1. quantity_in_name: "suiker 2tl" → the rows without an amount get 2 tl, then merge into suiker;
# 2. merge: source → target (IngredientMerge: recipes with both are skipped and reported);
# 3. rename: a name that is simply wrong ("yohgurt" → "yoghurt"); merges if the new name exists;
# 4. junk: deleted when nothing uses it; otherwise only reported, with where it is used;
# 5. variation_names: a name only used as an added ingredient of a variation ("zalm") is
#    renamed there to an existing ingredient ("zalmfilet"), so the variation gets nutrition;
# 6. ingredients: per ingredient a NEVO code, conversions and whether it is checked.
#    create: true makes the ingredient when it does not exist (for a variation name).
#    A given value replaces the current one (that is the correction); reviewed: true clears
#    "te controleren", reviewed: false sets it, and its note goes to the to-do list.
#
# A name that is not there (already merged, or only in another database) is skipped, so
# running it twice is safe: the second run changes nothing.
module Importers
  class IngredientCleanup
    SECTIONS = %w[ quantity_in_name merge rename junk variation_names ingredients ].freeze
    SETTINGS = %w[ create code grams_per_piece grams_per_ml reviewed note ].freeze

    class InvalidFile < StandardError; end

    def self.from_file(path, dry_run: false)
      new(YAML.safe_load_file(path) || {}, dry_run: dry_run).call
    end

    def initialize(decisions, dry_run:)
      unknown = decisions.keys - SECTIONS
      raise InvalidFile, "onbekende onderdelen: #{unknown.join(', ')}" if unknown.any?

      @decisions = decisions
      @dry_run = dry_run
      @lines = Hash.new { |hash, key| hash[key] = [] }
    end

    def call
      ApplicationRecord.transaction(requires_new: true) do
        quantities_in_names
        merges
        renames
        junk
        variation_names
        settings
        raise ActiveRecord::Rollback if @dry_run
      end
      report
    end

    private
      def find(name)
        Ingredient.find_by(name: Ingredient.normalize_value_for(:name, name.to_s))
      end

      def section(key)
        @decisions.fetch(key, nil) || {}
      end

      def note(heading, line)
        @lines[heading] << line
      end

      # ---------- 1. Quantity in the name ----------

      def quantities_in_names
        section("quantity_in_name").each do |name, settings|
          source = find(name)
          next note("Hoeveelheid uit de naam", "#{name}: niet gevonden, overgeslagen") unless source

          quantity = BigDecimal(settings.fetch("quantity").to_s)
          unit = settings.fetch("unit")
          rows = RecipeIngredient.where(ingredient: source, quantity: nil).includes(:recipe).to_a
          rows.each { |row| row.update_columns(quantity: quantity, unit: unit, updated_at: Time.current) }
          titles = rows.map { |row| row.recipe.title }.sort
          note("Hoeveelheid uit de naam",
            "#{name}: #{number(quantity)} #{unit} gezet in #{titles.any? ? titles.join(', ') : '(geen regels zonder hoeveelheid)'}")
          merge_one(name, settings.fetch("into"))
        end
      end

      # ---------- 2. Merge ----------

      def merges
        section("merge").each { |source, target| merge_one(source, target) }
      end

      def merge_one(source_name, target_name)
        source = find(source_name)
        target = find(target_name)
        return note("Samenvoegen", "#{source_name} → #{target_name}: #{source_name} niet gevonden, overgeslagen") unless source
        return note("Samenvoegen", "#{source_name} → #{target_name}: #{target_name} niet gevonden, NIET samengevoegd") unless target

        result = IngredientMerge.new(source, target).call
        details = [ ("recepten: #{result.moved_recipes.join(', ')}" if result.moved_recipes.any?),
                    ("overgenomen: #{result.copied.join(', ')}" if result.copied.any?) ].compact
        note("Samenvoegen", "#{source_name} → #{target_name}#{details.any? ? " (#{details.join('; ')})" : ''}")
        return if result.skipped_recipes.empty?

        note("Zelf doen", "#{source_name} → #{target_name}: niet samengevoegd in #{result.skipped_recipes.join(', ')} " \
          "(bevat allebei); #{source_name} blijft daarom bestaan")
      end

      # ---------- 3. Rename ----------

      def renames
        section("rename").each do |old_name, new_name|
          ingredient = find(old_name)
          next note("Hernoemen", "#{old_name} → #{new_name}: niet gevonden, overgeslagen") unless ingredient
          next merge_one(old_name, new_name) if find(new_name)

          rename_everywhere(ingredient, Ingredient.normalize_value_for(:name, new_name))
          note("Hernoemen", "#{old_name} → #{ingredient.name}")
        end
      end

      # Names that refer to an ingredient by text follow (see IngredientMerge).
      def rename_everywhere(ingredient, new_name)
        old_name = ingredient.name
        ingredient.update!(name: new_name)
        VariationChange.kind_add.where(name: old_name).update_all(name: new_name)
        ShoppingListItem.where(name: old_name).update_all(name: new_name)
        StandardItem.where(name: old_name).update_all(name: new_name) unless StandardItem.exists?(name: new_name)
        recipe_ids = RecipeIngredient.where(ingredient: ingredient).distinct.pluck(:recipe_id) +
          RecipeIngredientAlternative.where(ingredient: ingredient).joins(:recipe_ingredient).distinct.pluck("recipe_ingredients.recipe_id")
        Recipe.where(id: recipe_ids.uniq).find_each { |recipe| RecipeVersion.record!(recipe, note: "Ingrediënt hernoemd: #{old_name} → #{new_name}") }
      end

      # ---------- 4. Junk ----------

      def junk
        Array(section("junk")).each do |name|
          ingredient = find(name)
          next note("Rommel", "#{name}: niet gevonden, overgeslagen") unless ingredient

          uses = uses_of(ingredient)
          if uses.empty?
            ingredient.destroy!
            note("Rommel", "#{name}: nergens gebruikt, verwijderd")
          else
            note("Rommel", "#{name}: NIET verwijderd, gebruikt in #{uses.join('; ')}")
          end
        end
      end

      def uses_of(ingredient)
        rows = RecipeIngredient.where(ingredient: ingredient).includes(:recipe).map { |row| "#{row.recipe.title} (#{amount(row)})" }
        rows += RecipeIngredientAlternative.where(ingredient: ingredient).includes(recipe_ingredient: :recipe)
          .map { |alternative| "#{alternative.recipe_ingredient.recipe.title} (alternatief)" }
        rows += VariationChange.kind_add.where(name: ingredient.name).includes(recipe_variation: :recipe)
          .map { |change| "#{change.recipe_variation.recipe.title} / #{change.recipe_variation.name}" }
        rows
      end

      # ---------- 5. Names in variations ----------

      def variation_names
        section("variation_names").each do |old_name, new_name|
          old_name = Ingredient.normalize_value_for(:name, old_name)
          target = find(new_name)
          next note("Variatienamen", "#{old_name} → #{new_name}: #{new_name} niet gevonden, NIET aangepast") unless target

          changes = VariationChange.kind_add.where(name: old_name).includes(recipe_variation: :recipe).to_a
          next note("Variatienamen", "#{old_name} → #{target.name}: niet gevonden, overgeslagen") if changes.empty?

          changes.each { |change| change.update_columns(name: target.name, updated_at: Time.current) }
          changes.map { |change| change.recipe_variation.recipe }.uniq.each do |recipe|
            RecipeVersion.record!(recipe, note: "Variatie-ingrediënt hernoemd: #{old_name} → #{target.name}")
          end
          where = changes.map { |change| "#{change.recipe_variation.recipe.title} / #{change.recipe_variation.name}" }
          note("Variatienamen", "#{old_name} → #{target.name} (#{where.join(', ')})")
        end
      end

      # ---------- 6. Links, conversions, checked ----------

      def settings
        listed = section("ingredients")
        listed.each do |name, settings|
          unknown = settings.keys - SETTINGS
          raise InvalidFile, "#{name}: onbekende velden #{unknown.join(', ')}" if unknown.any?

          ingredient = find(name)
          if ingredient.nil? && settings["create"]
            ingredient = Ingredient.create!(name: name)
            note("Koppelingen en omrekening", "#{ingredient.name}: nieuw ingrediënt aangemaakt")
          end
          next note("Koppelingen en omrekening", "#{name}: niet gevonden, overgeslagen") unless ingredient

          apply(ingredient, settings)
        end

        names = listed.keys.map { |name| Ingredient.normalize_value_for(:name, name) }
        Ingredient.where.not(name: names).where.not(nevo_food_id: nil).order(:name).each do |ingredient|
          note("Gekoppeld maar niet in het bestand", "#{ingredient.name}: #{ingredient.nevo_food.display_name}")
        end
      end

      def apply(ingredient, settings)
        changes = []
        if settings.key?("code")
          food = settings["code"] && NevoFood.find_by(code: settings["code"])
          raise InvalidFile, "#{ingredient.name}: NEVO-code #{settings['code']} bestaat niet (eerst nevo:import)" if settings["code"] && !food

          if ingredient.nevo_food_id != food&.id
            changes << "NEVO #{ingredient.nevo_food&.display_name || '—'} → #{food ? "#{food.display_name} (#{food.code})" : 'ontkoppeld'}"
            ingredient.nevo_food = food
          end
        end
        %w[ grams_per_piece grams_per_ml ].each do |column|
          next unless settings.key?(column)

          value = settings[column] && BigDecimal(settings[column].to_s)
          next if ingredient.public_send(column) == value

          changes << "#{column == 'grams_per_piece' ? 'g/stuk' : 'g/ml'} #{show(ingredient.public_send(column))} → #{show(value)}"
          ingredient.public_send(:"#{column}=", value)
        end
        if settings.key?("reviewed") && ingredient.needs_review == settings["reviewed"]
          ingredient.needs_review = !settings["reviewed"]
          changes << (settings["reviewed"] ? "gecontroleerd" : "te controleren")
        end
        ingredient.save! if changes.any?

        state = ingredient.needs_review ? "te controleren" : "gecontroleerd"
        food = ingredient.nevo_food ? "#{ingredient.nevo_food.display_name} (#{ingredient.nevo_food.code})" : "niet gekoppeld"
        note("Koppelingen en omrekening",
          "#{ingredient.name}: #{changes.any? ? changes.join('; ') : 'ongewijzigd'} | #{food} | #{conversions(ingredient)} | #{state}")
        note("Zelf doen", "#{ingredient.name}: #{settings['note']}") if ingredient.needs_review && settings["note"]
      end

      # ---------- Report ----------

      def report
        headings = [ "Hoeveelheid uit de naam", "Samenvoegen", "Hernoemen", "Rommel", "Variatienamen", "Koppelingen en omrekening",
                     "Gekoppeld maar niet in het bestand", "Zelf doen" ]
        sections = headings.map do |heading|
          lines = @lines[heading]
          "#{heading} (#{lines.size}):\n#{lines.empty? ? '  (geen)' : lines.map { |line| "  #{line}" }.join("\n")}"
        end
        [ (@dry_run ? "DRY RUN: alles is teruggedraaid, er is niets opgeslagen." : nil), *sections ].compact.join("\n\n")
      end

      def conversions(ingredient)
        [ ingredient.grams_per_piece && "#{show(ingredient.grams_per_piece)} g/stuk",
          ingredient.grams_per_ml && "#{show(ingredient.grams_per_ml)} g/ml" ].compact.join(", ").presence || "geen omrekening"
      end

      def amount(row)
        row.quantity ? "#{number(row.quantity)} #{row.unit}" : "geen hoeveelheid"
      end

      def show(value)
        value.nil? ? "—" : number(value)
      end

      def number(decimal)
        decimal.to_s("F").delete_suffix(".0").tr(".", ",")
      end
  end
end
