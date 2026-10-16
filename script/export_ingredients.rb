# Alleen lezen: print per ingrediënt de naam, de NEVO-koppeling, de omrekeningen en waar
# het voorkomt (recepten met hoeveelheid en eenheid, variaties, alternatieven, lijsten).
#
#   DATABASE_URL='postgresql://…' RAILS_ENV=production bin/rails runner script/export_ingredients.rb > /tmp/prod_export.txt
#
# Alleen queries, geen save/update/create/destroy. Als extra zekerheid draait alles in een
# READ ONLY-transactie: PostgreSQL weigert dan zelf elke schrijfactie. Werkt ook op een
# database zonder de tabel recipe_ingredient_alternatives (nog niet gedeployd).

def number(decimal)
  decimal.to_s("F").delete_suffix(".0").tr(".", ",")
end

def amount(quantity, unit)
  quantity ? "#{number(quantity)} #{unit}" : "geen hoeveelheid"
end

connection = ActiveRecord::Base.connection
config = ActiveRecord::Base.connection_db_config
puts "Database: #{config.database} (#{config.host || 'localhost'}), omgeving #{Rails.env} (alleen lezen)"

connection.transaction do
  connection.execute("SET TRANSACTION READ ONLY")

  rows = connection.select_rows(<<~SQL).group_by(&:first)
    SELECT i.name, r.title, ri.quantity, ri.unit, ri.optional
    FROM recipe_ingredients ri
    JOIN ingredients i ON i.id = ri.ingredient_id
    JOIN recipes r ON r.id = ri.recipe_id
    ORDER BY r.title
  SQL
  additions = connection.select_rows(<<~SQL).group_by(&:first)
    SELECT vc.name, r.title, v.name, vc.quantity, vc.unit
    FROM variation_changes vc
    JOIN recipe_variations v ON v.id = vc.recipe_variation_id
    JOIN recipes r ON r.id = v.recipe_id
    WHERE vc.kind = 'add'
    ORDER BY r.title
  SQL
  alternatives =
    if connection.table_exists?(:recipe_ingredient_alternatives)
      connection.select_rows(<<~SQL).group_by(&:first)
        SELECT alt.name, r.title, orig.name, a.quantity, a.unit
        FROM recipe_ingredient_alternatives a
        JOIN ingredients alt ON alt.id = a.ingredient_id
        JOIN recipe_ingredients ri ON ri.id = a.recipe_ingredient_id
        JOIN ingredients orig ON orig.id = ri.ingredient_id
        JOIN recipes r ON r.id = ri.recipe_id
        ORDER BY r.title
      SQL
    else
      {}
    end
  shopping = connection.select_rows("SELECT name, COUNT(*) FROM shopping_list_items GROUP BY name").to_h
  standard = connection.select_values("SELECT name FROM standard_items").to_set

  ingredients = connection.select_rows(<<~SQL)
    SELECT i.name, n.code, COALESCE(NULLIF(n.synonym, ''), n.name), n.unit, i.grams_per_piece, i.grams_per_ml,
           i.needs_review, (i.label_kcal IS NOT NULL OR i.label_protein IS NOT NULL OR i.label_carbohydrates IS NOT NULL
             OR i.label_fat IS NOT NULL OR i.label_fiber IS NOT NULL)
    FROM ingredients i
    LEFT JOIN nevo_foods n ON n.id = i.nevo_food_id
    ORDER BY i.name
  SQL

  ingredients.each do |name, code, food, food_unit, per_piece, per_ml, needs_review, label|
    cast = ->(value) { value && BigDecimal(value.to_s) }
    nevo = code ? "NEVO #{code} #{food} (per 100 #{food_unit})" : "niet gekoppeld"
    nevo += " + etiket" if ActiveModel::Type::Boolean.new.cast(label)
    conversions = [ per_piece && "#{number(cast.(per_piece))} g/stuk", per_ml && "#{number(cast.(per_ml))} g/ml" ].compact.join(", ")
    review = ActiveModel::Type::Boolean.new.cast(needs_review) ? " | te controleren" : ""
    puts "#{name} | #{nevo} | #{conversions.presence || 'geen omrekening'}#{review}"

    uses = Array(rows[name]).map { |_, title, quantity, unit, optional|
      "#{title}: #{amount(cast.(quantity), unit)}#{' (optioneel)' if ActiveModel::Type::Boolean.new.cast(optional)}"
    }
    uses += Array(additions[name]).map { |_, title, variation, quantity, unit| "#{title} / variatie #{variation}: + #{amount(cast.(quantity), unit)}" }
    uses += Array(alternatives[name]).map { |_, title, original, quantity, unit|
      "#{title}: alternatief voor #{original} (#{quantity ? amount(cast.(quantity), unit) : 'zelfde hoeveelheid'})"
    }
    uses << "boodschappenlijst #{shopping[name]}x" if shopping[name]
    uses << "standaardlijst" if standard.include?(name)
    uses << "(nergens gebruikt)" if uses.empty?
    uses.each { |use| puts "    #{use}" }
  end

  puts "--- variatie-ingrediënten zonder eigen ingrediënt:"
  (additions.keys - ingredients.map(&:first)).sort.each do |name|
    additions[name].each { |_, title, variation, quantity, unit| puts "    #{name}: #{title} / variatie #{variation}: + #{amount(quantity && BigDecimal(quantity.to_s), unit)}" }
  end
  puts "Totaal: #{ingredients.size} ingrediënten."
end
