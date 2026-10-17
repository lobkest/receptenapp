require "test_helper"
require Rails.root.join("db/migrate/20261017170001_remove_vega_tag")

# The test database is made from db/schema.rb, so this test runs the data migration
# itself. Fixtures: vega on pannenkoeken and erwtensoep, and "Met spek" takes it off.
class RemoveVegaTagTest < ActiveSupport::TestCase
  test "removes vega from recipes and variations, then the tag; the other tags stay" do
    migrate

    assert_nil Tag.find_by(name: "vega")
    assert_equal [ "zoet" ], recipes(:pannenkoeken).reload.tags.map(&:name)
    assert_equal [ "soep" ], recipes(:erwtensoep).reload.tags.map(&:name)
    assert_empty recipe_variations(:spek).reload.tag_changes
    assert Tag.exists?(name: "soep")
    assert Tag.exists?(name: "vegetarisch")
  end

  test "running it twice changes nothing more" do
    migrate
    counts = -> { [ Tag.count, RecipeTag.count, VariationTagChange.count ] }
    after_first = counts.call

    migrate

    assert_equal after_first, counts.call
  end

  test "without vega it does nothing" do
    RecipeTag.where(tag: tags(:vega)).delete_all
    VariationTagChange.where(tag: tags(:vega)).delete_all
    tags(:vega).destroy!

    assert_no_difference([ "Tag.count", "RecipeTag.count", "VariationTagChange.count" ]) { migrate }
  end

  private
    def migrate
      ActiveRecord::Migration.suppress_messages { RemoveVegaTag.new.migrate(:up) }
    end
end
