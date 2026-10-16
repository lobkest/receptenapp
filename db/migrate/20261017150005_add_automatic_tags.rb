# The five traits and the four automatic tags with what they exclude. Plain SQL instead
# of the models, so this migration still runs when they change later. Idempotent: an
# existing trait, tag ("vegetarisch" made by hand) or exclusion is left alone and reused,
# so nothing is made twice.
class AddAutomaticTags < ActiveRecord::Migration[8.1]
  TRAITS = %w[ vlees vis dierlijk gluten lactose ].freeze
  EXCLUSIONS = {
    "vegetarisch" => %w[ vlees vis ],
    "veganistisch" => %w[ dierlijk ],
    "glutenvrij" => %w[ gluten ],
    "lactosevrij" => %w[ lactose ]
  }.freeze

  def up
    TRAITS.each { |name| insert_name(:traits, name) }
    EXCLUSIONS.each do |tag, traits|
      insert_name(:tags, tag)
      execute <<~SQL.squish
        INSERT INTO tag_exclusions (tag_id, trait_id, created_at, updated_at)
        SELECT tags.id, traits.id, NOW(), NOW() FROM tags, traits
        WHERE tags.name = #{quote(tag)} AND traits.name IN (#{traits.map { |name| quote(name) }.join(', ')})
        ON CONFLICT (tag_id, trait_id) DO NOTHING
      SQL
    end
  end

  # The tags stay (recipes may use them); without exclusions they are ordinary tags again.
  def down
    execute "DELETE FROM tag_exclusions"
    execute "DELETE FROM traits WHERE name IN (#{TRAITS.map { |name| quote(name) }.join(', ')})"
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
