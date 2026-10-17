require "test_helper"
require Rails.root.join("db/migrate/20261017180004_mark_staple_ingredients")
require Rails.root.join("db/migrate/20261017180005_link_shopping_list_items_to_ingredients")

# The test database is made from db/schema.rb, not by running migrations, so these tests
# run the two data migrations themselves, twice (idempotent).
class PantryMigrationsTest < ActiveSupport::TestCase
  test "MarkStapleIngredients makes the existing names staple and skips the missing ones" do
    olijfolie = Ingredient.create!(name: "olijfolie")

    migrate(MarkStapleIngredients)
    migrate(MarkStapleIngredients)

    assert_equal %w[ bloem olijfolie zout ], Ingredient.where(staple: true).order(:name).pluck(:name)
    assert olijfolie.reload.staple
    refute Ingredient.exists?(name: "peper"), "a missing name is not created"
  end

  test "the seeds use the same list" do
    load Rails.root.join("db/seeds.rb")
    seeded = Ingredient.where(staple: true).order(:name).pluck(:name)
    Ingredient.update_all(staple: false)

    migrate(MarkStapleIngredients)

    assert_equal seeded, Ingredient.where(staple: true).order(:name).pluck(:name)
  end

  test "LinkShoppingListItemsToIngredients links lines by name, and leaves linked ones alone" do
    ShoppingListItem.update_all(ingredient_id: nil)
    other = ShoppingListItem.create!(name: "wc-papier")
    linked = ShoppingListItem.create!(name: "melk")
    linked.update_columns(ingredient_id: ingredients(:ei).id)
    # Stored before names were normalized everywhere.
    messy = ShoppingListItem.create!(name: "ei")
    messy.update_columns(name: "  Ei ", ingredient_id: nil)

    migrate(LinkShoppingListItemsToIngredients)
    migrate(LinkShoppingListItemsToIngredients)

    assert_equal ingredients(:bloem).id, shopping_list_items(:bloem).reload.ingredient_id
    assert_equal ingredients(:zout).id, shopping_list_items(:zout).reload.ingredient_id
    assert_equal ingredients(:melk).id, shopping_list_items(:melk).reload.ingredient_id
    assert_equal ingredients(:ei).id, messy.reload.ingredient_id
    assert_equal ingredients(:ei).id, linked.reload.ingredient_id, "already linked: stays"
    assert_nil other.reload.ingredient_id
  end

  private
    def migrate(migration)
      ActiveRecord::Migration.suppress_messages { migration.new.migrate(:up) }
    end
end
