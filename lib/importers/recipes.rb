# [{
#   "title": "Pien orzo", "servings": 4, "category": "Diner", "description": "...",
#   "tags": ["vega"],
#   "ingredients": [{ "name": "Orzo", "quantity": 320, "unit": "g", "optional": false }],
#   "steps": ["Orzo koken."],
#   "variations": [{ "name": "Met zalm", "remove": ["Parmaham"],
#                    "add": [{ "name": "Zalm", "quantity": 90, "unit": "g" }], "notes": null }]
# }]
#
# A recipe whose title exists (in any case) is skipped. Ingredients are matched by name
# by RecipeIngredient itself (Ingredient#name is lower case); only unknown ones are made.
# Amounts in g, ml, stuks, tl or el (the units of the model). Without an amount ("naar smaak") leave out quantity and unit.
module Importers
  class Recipes < Base
    FIELDS = %w[ title servings category description tags ingredients steps variations ].freeze
    INGREDIENT_FIELDS = %w[ name quantity unit optional ].freeze
    VARIATION_FIELDS = %w[ name add remove notes ].freeze
    ADDITION_FIELDS = %w[ name quantity unit ].freeze
    UNITS = HasQuantity::UNITS

    private
      def import(row, line)
        check_fields!(row)

        title = row["title"].to_s.squish
        if Recipe.where("lower(title) = lower(?)", title).exists?
          return report.skipped!(line, title, "titel bestaat al")
        end

        names = ingredients(row).map { |ingredient| Ingredient.normalize_value_for(:name, ingredient["name"].to_s) }
        new_ingredients = names.compact_blank.uniq.reject { |name| Ingredient.exists?(name: name) }
        new_category = row["category"].present? && Category.find_named(row["category"]).nil?

        recipe = Recipe.new(recipe_attributes(row))
        recipe.save!
        add_variations!(recipe, Array(row["variations"]))

        report.created!(line, recipe.title)
        report.new_ingredients.concat(new_ingredients)
        report.new_categories << recipe.category.name if new_category
      end

      def label(row)
        row["title"].to_s
      end

      def ingredients(row)
        Array(row["ingredients"])
      end

      def recipe_attributes(row)
        {
          title: row["title"],
          description: row["description"],
          servings: row["servings"],
          category_name: row["category"],
          tag_names: row["tags"],
          recipe_ingredients_attributes: ingredients(row).map { |ingredient|
            { ingredient_name: ingredient["name"], quantity: ingredient["quantity"],
              unit: ingredient["unit"], optional: ingredient["optional"] }.compact
          },
          steps_attributes: Array(row["steps"]).map { |body| { body: body } }
        }.compact
      end

      # After the recipe: a removal points at a saved ingredient row (recipe_ingredient_id).
      # The variations together make one new version ("Gewijzigd: variaties"), like the
      # recipe form does when it saves several variations at once.
      def add_variations!(recipe, variations)
        return if variations.empty?

        rows = recipe.recipe_ingredients.index_by(&:ingredient_name)
        variations.each do |data|
          variation = recipe.variations.build(name: data["name"], notes: data["notes"],
            added_ingredients: Array(data["add"]), removed_ingredient_ids: removed_ids(rows, data))
          variation.skip_recipe_version = true
          variation.save!
        end
        RecipeVersion.record!(recipe)
      end

      def removed_ids(rows, data)
        Array(data["remove"]).map do |name|
          row = rows[Ingredient.normalize_value_for(:name, name.to_s)]
          raise Rejected, "variatie #{data['name']}: '#{name}' staat niet in het recept" unless row

          row.id
        end
      end

      # Unknown fields and units the model does not know, before anything is saved.
      def check_fields!(row)
        reject_unknown_keys!(row, FIELDS, "recept")
        amounts = ingredients(row).map { |ingredient| [ "ingrediënt", ingredient, INGREDIENT_FIELDS ] }
        Array(row["variations"]).each do |variation|
          reject_unknown_keys!(variation, VARIATION_FIELDS, "variatie #{variation['name']}")
          amounts += Array(variation["add"]).map { |addition| [ "variatie #{variation['name']}", addition, ADDITION_FIELDS ] }
        end

        errors = amounts.filter_map do |where, amount, fields|
          reject_unknown_keys!(amount, fields, "#{where} #{amount['name']}")
          next if amount["unit"].blank? || UNITS.include?(amount["unit"])

          "#{where} '#{amount['name']}': eenheid '#{amount['unit']}' niet toegestaan (alleen #{UNITS.to_sentence(last_word_connector: ' of ', two_words_connector: ' of ')})"
        end
        raise Rejected, errors if errors.any?
      end
  end
end
