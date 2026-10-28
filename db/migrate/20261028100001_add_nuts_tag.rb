# The trait "noten" and the automatic tag "notenvrij" that excludes it, like migration
# AddAutomaticTags. Noten also covers pinda's and pijnboompitten (both called nuts in
# the kitchen); not kokos or nootmuskaat.
#
# An ingredient without the trait counts as ok, so the ingredients that are or may contain
# nuts get it here by name; otherwise a recipe with walnoten would be notenvrij. Their
# traits_checked is left as it is. A name that does not exist is skipped.
#
# Plain SQL instead of the models, so this migration still runs when they change later.
# Idempotent: an existing trait, tag ("notenvrij" made by hand) or link is reused.
class AddNutsTag < ActiveRecord::Migration[8.1]
  NUT_INGREDIENTS = [
    "noten", "gemengde noten", "notenmix", "studentenhaver", "notenpasta",
    "amandel", "amandelen", "amandelmeel", "amandelschaafsel", "amandelmelk", "amandelpasta", "amandelspijs",
    "walnoot", "walnoten", "hazelnoot", "hazelnoten", "hazelnootpasta", "cashewnoot", "cashewnoten",
    "pecannoot", "pecannoten", "pistache", "pistachenoten", "macadamianoot", "macadamianoten",
    "paranoot", "paranoten", "pijnboompitten",
    "pinda", "pinda's", "pindakaas", "pindasaus", "satésaus", "satesaus",
    "pesto", "rode pesto", "groene pesto", "marsepein", "granola"
  ].freeze

  def up
    insert_name(:traits, "noten")
    insert_name(:tags, "notenvrij")
    execute <<~SQL.squish
      INSERT INTO tag_exclusions (tag_id, trait_id, created_at, updated_at)
      SELECT tags.id, traits.id, NOW(), NOW() FROM tags, traits
      WHERE tags.name = 'notenvrij' AND traits.name = 'noten'
      ON CONFLICT (tag_id, trait_id) DO NOTHING
    SQL
    execute <<~SQL.squish
      INSERT INTO ingredient_traits (ingredient_id, trait_id, created_at, updated_at)
      SELECT ingredients.id, traits.id, NOW(), NOW() FROM ingredients, traits
      WHERE traits.name = 'noten' AND ingredients.name IN (#{NUT_INGREDIENTS.map { |name| quote(name) }.join(', ')})
      ON CONFLICT (ingredient_id, trait_id) DO NOTHING
    SQL
  end

  # The tag stays (recipes may use it); without its exclusion it is an ordinary tag again.
  def down
    execute "DELETE FROM tag_exclusions WHERE trait_id IN (SELECT id FROM traits WHERE name = 'noten')"
    execute "DELETE FROM ingredient_traits WHERE trait_id IN (SELECT id FROM traits WHERE name = 'noten')"
    execute "DELETE FROM traits WHERE name = 'noten'"
  end

  private
    def insert_name(table, name)
      execute <<~SQL.squish
        INSERT INTO #{table} (name, created_at, updated_at) VALUES (#{quote(name)}, NOW(), NOW())
        ON CONFLICT (name) DO NOTHING
      SQL
    end

    def quote(value)
      connection.quote(value)
    end
end
