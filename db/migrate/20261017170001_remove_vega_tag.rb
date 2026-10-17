# The hand-set tag "vega" goes: the automatic tag "vegetarisch" (worked out from the
# ingredients) says the same. First its links (recipes and variations), then the tag
# itself, but only when nothing refers to it any more.
#
# Plain SQL instead of the models, so this migration still runs when they change later.
# Idempotent: when "vega" is gone, every statement simply finds nothing.
#
# Irreversible: down puts nothing back. Which recipes had "vega" is not kept here; the
# recipe versions (recipe_versions.snapshot) still have it in their tag_names.
class RemoveVegaTag < ActiveRecord::Migration[8.1]
  def up
    execute "DELETE FROM recipe_tags WHERE tag_id IN (SELECT id FROM tags WHERE name = 'vega')"
    execute "DELETE FROM variation_tag_changes WHERE tag_id IN (SELECT id FROM tags WHERE name = 'vega')"
    execute <<~SQL.squish
      DELETE FROM tags WHERE name = 'vega'
        AND NOT EXISTS (SELECT 1 FROM recipe_tags WHERE recipe_tags.tag_id = tags.id)
        AND NOT EXISTS (SELECT 1 FROM variation_tag_changes WHERE variation_tag_changes.tag_id = tags.id)
        AND NOT EXISTS (SELECT 1 FROM tag_exclusions WHERE tag_exclusions.tag_id = tags.id)
    SQL
  end

  # Nothing to put back (see above); down only lets you roll back past this migration.
  def down
  end
end
