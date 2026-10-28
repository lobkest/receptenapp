require "test_helper"
require "rake"

# bin/rails nevo:import and nevo:auto_link, with the mini fixture and the real link file.
class NevoTaskTest < ActiveSupport::TestCase
  include TaskTestHelper

  setup do
    Rails.application.load_tasks if Rake::Task.tasks.none? { |task| task.name == "nevo:import" }
  end

  test "nevo:import twice: the second time nothing new" do
    file = Rails.root.join("test/fixtures/files/nevo_mini.csv").to_s

    output = assert_difference("NevoFood.count", 4) { run_task("nevo:import", FILE: file) }
    assert_includes output, "NEVO-Online 2025 9.0: 4 producten (4 nieuw, 0 bijgewerkt)."
    output = assert_no_difference("NevoFood.count") { run_task("nevo:import", FILE: file) }
    assert_includes output, "(0 nieuw, 4 bijgewerkt)"
  end

  test "nevo:auto_link links unlinked ingredients once, marks them and fills in used conversions" do
    Ingredient.update_all(nevo_food_id: nil, grams_per_piece: nil)

    output = assert_no_changes(-> { Ingredient.where.not(nevo_food_id: nil).count }) { run_task("nevo:auto_link", DRY_RUN: "1") }
    assert_includes output, "DRY RUN"

    output = run_task("nevo:auto_link")
    ei = ingredients(:ei).reload
    assert_equal nevo_foods(:kippenei), ei.nevo_food
    assert ei.needs_review
    # ei is used in stuks (pannenkoeken), so it gets the estimate from the file.
    assert_equal 50, ei.grams_per_piece
    assert_equal nevo_foods(:tarwebloem), ingredients(:bloem).reload.nevo_food
    # bloem is only used in g: no gram per ml.
    assert_nil ingredients(:bloem).grams_per_ml
    assert_includes output, "zout → NEVO-code 841 ontbreekt"
    assert_includes output, "melk → geen match"
    assert_includes output, "ei → gekoppeld | Kippeneieren rauw (83) | 50 g/stuk"

    # A link chosen in the app is never undone; running again changes nothing.
    ingredients(:bloem).update!(nevo_food: nevo_foods(:melk), needs_review: false)
    output = run_task("nevo:auto_link")
    assert_equal nevo_foods(:melk), ingredients(:bloem).reload.nevo_food
    refute ingredients(:bloem).needs_review
    assert_includes output, "bloem → al gekoppeld"
  end
end
