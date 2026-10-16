require "test_helper"
require "rake"

# bin/rails ingredients:cleanup with the real decisions file (db/import/ingredient_cleanup.yml).
class IngredientsTaskTest < ActiveSupport::TestCase
  setup do
    Rails.application.load_tasks if Rake::Task.tasks.none? { |task| task.name == "ingredients:cleanup" }
    # A made-up product for every NEVO code in the file (no real NEVO data in the repo).
    codes = YAML.load_file(Rails.root.join("db/import/ingredient_cleanup.yml"))["ingredients"].values.filter_map { |settings| settings["code"] }
    (codes.uniq - NevoFood.pluck(:code)).each do |code|
      NevoFood.create!(code: code, name: "Testproduct #{code}", unit: "g", version: "test", kcal: 100)
    end
  end

  def run_task(**env)
    env = env.transform_keys(&:to_s)
    old = env.keys.index_with { |key| ENV[key] }
    env.each { |key, value| ENV[key] = value }
    Rake::Task["ingredients:cleanup"].reenable
    capture_io { Rake::Task["ingredients:cleanup"].invoke }.first
  ensure
    old.each { |key, value| ENV[key] = value }
  end

  test "the real file: dry run writes nothing, says which database, and runs twice without errors" do
    snapshot = -> { Ingredient.order(:id).pluck(:name, :nevo_food_id, :grams_per_piece, :grams_per_ml, :needs_review) }
    before = snapshot.call

    output = run_task(DRY_RUN: "1")
    assert_includes output, "Database: "
    assert_includes output, "DRY RUN"
    assert_equal before, snapshot.call

    run_task
    after_first = snapshot.call
    run_task
    assert_equal after_first, snapshot.call
  end
end
