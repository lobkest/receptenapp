require "test_helper"
require "rake"

# bin/rails traits:setup, with the real suggestion file (db/import/ingredient_traits.yml).
class TraitsTaskTest < ActiveSupport::TestCase
  include TaskTestHelper

  setup do
    Rails.application.load_tasks if Rake::Task.tasks.none? { |task| task.name == "traits:setup" }
    @report = Rails.root.join("tmp/test_tag_verschillen_#{Process.pid}.txt")
    File.delete(@report) if File.exist?(@report)
    # By hand: stamppot (no ingredients) and pannenkoeken are vegetarisch, the variation
    # "Met spek" takes it off again, and someone added veganistisch to pannenkoeken.
    RecipeTag.insert_all!([ { recipe_id: recipes(:stamppot).id, tag_id: tags(:vegetarisch).id },
                            { recipe_id: recipes(:pannenkoeken).id, tag_id: tags(:vegetarisch).id },
                            { recipe_id: recipes(:pannenkoeken).id, tag_id: tags(:veganistisch).id } ])
    VariationTagChange.insert_all!([ { recipe_variation_id: recipe_variations(:spek).id, tag_id: tags(:vegetarisch).id, kind: "remove" } ])
    # ei without traits yet: it gets the suggestion. bloem was checked: it stays as it is.
    ingredients(:ei).traits = []
    ingredients(:bloem).update!(traits_checked: true)
  end

  teardown do
    File.delete(@report) if File.exist?(@report)
  end

  def run_task(**env)
    super("traits:setup", REPORT: @report.relative_path_from(Rails.root).to_s, **env)
  end

  test "DRY_RUN writes the differences but saves nothing" do
    output = assert_no_difference([ "IngredientTrait.count", "RecipeTag.count", "VariationTagChange.count" ]) { run_task(DRY_RUN: "1") }

    assert_includes output, "DRY RUN"
    assert File.exist?(@report)
  end

  test "suggests traits, writes the differences and removes the automatic tags by hand" do
    output = run_task

    assert_equal [ "dierlijk" ], ingredients(:ei).reload.traits.map(&:name)
    refute ingredients(:ei).traits_checked
    assert_equal [ "gluten" ], ingredients(:bloem).reload.traits.map(&:name)
    assert_includes output, "  ei → dierlijk"
    assert_includes output, "Twijfelgevallen:"

    report = File.read(@report)
    assert_includes report, "Vergeleken: veganistisch, vegetarisch."
    assert_includes report, "Stamppot | vegetarisch | ja | nee"
    assert_includes report, "Pannenkoeken | veganistisch | ja | nee | door melk, ei"
    assert_not_includes report, "Pannenkoeken | vegetarisch", "by hand and worked out agree"
    assert_not_includes report, "Met spek", "the variation loses vegetarisch both ways"
    assert_includes report, "Totaal: 2 verschillen."

    assert_empty RecipeTag.where(tag: Tag.automatic)
    assert_empty VariationTagChange.where(tag: Tag.automatic)
    assert_equal %w[ vega zoet ], recipes(:pannenkoeken).reload.tags.map(&:name).sort
    assert_includes output, "verwijderd: 3 bij recepten, 1 bij variaties"
  end

  test "running again changes nothing and keeps the first report" do
    run_task
    first = File.read(@report)

    output = assert_no_difference("IngredientTrait.count") { run_task }
    assert_equal first, File.read(@report)
    assert_includes output, "is niet aangepast"
  end

  test "a variation's added ingredient that is not an ingredient yet becomes one" do
    VariationChange.where(name: "spek").update_all(name: "chorizo")

    output = run_task

    chorizo = Ingredient.find_by!(name: "chorizo")
    refute chorizo.traits_checked
    assert_includes output, "Nieuwe ingrediënten uit variaties: chorizo"
  end
end
