require "test_helper"
require Rails.root.join("db/migrate/20261016100002_add_start_categories")

# The test database is made from db/schema.rb, not by running migrations, so this test
# runs the data migration itself: on an empty table, and again (idempotent).
class AddStartCategoriesTest < ActiveSupport::TestCase
  setup do
    Category.delete_all
  end

  test "maakt Ontbijt, Lunch, Diner en Snacks aan, in die volgorde" do
    migrate

    assert_equal [ [ "Ontbijt", 1 ], [ "Lunch", 2 ], [ "Diner", 3 ], [ "Snacks", 4 ] ],
      Category.ordered.pluck(:name, :position)
  end

  test "twee keer draaien, of met een bestaande naam in andere hoofdletters, voegt niets dubbel toe" do
    Category.create!(name: "lunch", position: 7)

    migrate
    migrate

    assert_equal 4, Category.count
    assert_equal 7, Category.find_named("Lunch").position, "de bestaande blijft zoals hij was"
  end

  test "de seeds geven een nieuwe database dezelfde categorieën" do
    load Rails.root.join("db/seeds.rb")
    load Rails.root.join("db/seeds.rb")

    assert_equal %w[ Ontbijt Lunch Diner Snacks ], Category.ordered.pluck(:name)
  end

  private
    def migrate
      ActiveRecord::Migration.suppress_messages { AddStartCategories.new.migrate(:up) }
    end
end
