require "test_helper"

# Only what differs from the default is stored: a staple is in the house, anything else not.
class PantryItemTest < ActiveSupport::TestCase
  setup do
    @zout = ingredients(:zout).tap { |zout| zout.update!(staple: true) }
    @ei = ingredients(:ei)
  end

  test "a staple is in the house without a row; out is a row with present false" do
    assert_includes PantryItem.present_ingredient_ids, @zout.id

    assert PantryItem.set!(@zout, false)
    assert_equal [ false ], PantryItem.where(ingredient: @zout).pluck(:present)
    refute_includes PantryItem.present_ingredient_ids, @zout.id

    assert PantryItem.set!(@zout, true)
    refute PantryItem.exists?(ingredient: @zout), "back to the default: no row"
  end

  test "anything else is in the house only with a row; taking it out deletes the row" do
    refute_includes PantryItem.present_ingredient_ids, @ei.id

    assert PantryItem.set!(@ei, true)
    assert_includes PantryItem.present_ingredient_ids, @ei.id
    refute PantryItem.set!(@ei, true), "already in the house: nothing changes"

    assert PantryItem.set!(@ei, false)
    refute PantryItem.exists?(ingredient: @ei)
    refute PantryItem.set!(@ei, false)
  end

  test "deleting the ingredient deletes its row" do
    saffraan = ingredients(:ongebruikt)
    PantryItem.set!(saffraan, true)

    assert_difference("PantryItem.count", -1) { saffraan.destroy! }
  end
end
