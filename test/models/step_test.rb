require "test_helper"

class StepTest < ActiveSupport::TestCase
  test "tekst is verplicht en wordt getrimd" do
    assert_equal "Bakken.", Step.new(body: "  Bakken.\n").body
    assert_not Step.new(recipe: recipes(:erwtensoep), position: 1, body: "  ").valid?
  end

  test "tekst is maximaal 2000 tekens" do
    assert_not Step.new(recipe: recipes(:erwtensoep), position: 1, body: "a" * 2001).valid?
  end

  test "positie is uniek per recept in de database" do
    duplicate = Step.new(recipe: recipes(:pannenkoeken), position: 1, body: "Nog een eerste stap.")

    # The constraint is deferred to commit time; tests never commit, so check it right away.
    Step.connection.execute("SET CONSTRAINTS steps_recipe_id_position_unique IMMEDIATE")
    assert_raises(ActiveRecord::RecordNotUnique) { duplicate.save!(validate: false) }
  end
end
