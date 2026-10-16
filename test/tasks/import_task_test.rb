require "test_helper"
require "rake"

# The rake tasks themselves, with the real files in db/import/.
class ImportTaskTest < ActiveSupport::TestCase
  setup do
    Rails.application.load_tasks if Rake::Task.tasks.none? { |task| task.name == "import:recipes" }
  end

  def run_task(name, **env)
    env = env.transform_keys(&:to_s)
    old = env.keys.index_with { |key| ENV[key] }
    env.each { |key, value| ENV[key] = value }
    Rake::Task[name].reenable
    capture_io { Rake::Task[name].invoke }.first
  ensure
    old.each { |key, value| ENV[key] = value }
  end

  test "standaardlijst: dry-run schrijft niets, daarna echt, daarna niets dubbel" do
    file = Rails.root.join("db/import/standaardlijst.json").to_s

    output = assert_no_difference("StandardItem.count") { run_task("import:standard_items", FILE: file, DRY_RUN: "1") }
    assert_includes output, "DRY RUN"

    # The fixtures already have kaas and wc-papier, so those two are skipped.
    assert_difference("StandardItem.count", 85) { run_task("import:standard_items", FILE: file) }
    output = assert_no_difference("StandardItem.count") { run_task("import:standard_items", FILE: file) }
    assert_includes output, "Totaal: 0 aangemaakt, 87 overgeslagen, 0 met fouten."
  end

  test "recepten: Pien orzo wordt één keer aangemaakt" do
    file = Rails.root.join("db/import/recepten.json").to_s

    assert_no_difference("Recipe.count") { run_task("import:recipes", FILE: file, DRY_RUN: "1") }
    output = assert_difference("Recipe.count", 1) { run_task("import:recipes", FILE: file) }
    assert_includes output, "regel 1: Pien orzo"

    recipe = Recipe.find_by!(title: "Pien orzo")
    assert_equal 11, recipe.recipe_ingredients.size
    assert_equal [ "Met zalm", "Met mozzarella" ], recipe.variations.map(&:name)
    assert_no_difference("Recipe.count") { run_task("import:recipes", FILE: file) }
  end
end
