require "test_helper"

class RecipeTest < ActiveSupport::TestCase
  test "geldig met titel, porties, een ingrediënt en een stap" do
    assert new_recipe.valid?
  end

  test "ongeldig zonder titel" do
    recipe = new_recipe(title: nil)
    assert_not recipe.valid?
    assert recipe.errors.added?(:title, :blank)
  end

  test "porties moeten groter dan 0 zijn" do
    recipe = new_recipe(servings: 0)
    assert_not recipe.valid?
    assert recipe.errors[:servings].any?
  end

  test "porties zijn alleen hele getallen van 1 tot en met 50" do
    [ "1", "4", "50", 12 ].each { |servings| assert new_recipe(servings: servings).valid?, servings.inspect }

    { "0" => :greater_than, "-2" => :greater_than, "51" => :less_than_or_equal_to,
      "2,5" => :not_a_number, "2.5" => :not_an_integer, "abc" => :not_a_number, "" => :not_a_number }.each do |servings, error|
      recipe = new_recipe(servings: servings)
      assert_not recipe.valid?, servings.inspect
      assert_includes recipe.errors.details[:servings].pluck(:error), error, servings.inspect
    end
  end

  test "fixture is geldig" do
    assert recipes(:pannenkoeken).valid?
  end

  test "nieuw recept is standaard pending" do
    assert new_recipe.pending?
  end

  test "status accepteert pending, approved en rejected" do
    %w[ pending approved rejected ].each do |status|
      recipe = new_recipe(status: status)
      assert recipe.valid?, "#{status} zou geldig moeten zijn"
    end
  end

  test "onbekende status is ongeldig" do
    recipe = new_recipe(status: "banaan")
    assert_not recipe.valid?
    assert recipe.errors[:status].any?
  end

  test "approved! slaat de nieuwe status op" do
    recipe = recipes(:erwtensoep)
    recipe.approved!
    assert recipe.reload.approved?
  end

  test "scopes filteren op status" do
    assert_includes Recipe.approved, recipes(:pannenkoeken)
    assert_not_includes Recipe.approved, recipes(:erwtensoep)
    assert_not_includes Recipe.approved, recipes(:stamppot)
  end

  # Ingredients and steps

  test "nieuw recept zonder ingrediënten of stappen is ongeldig" do
    recipe = new_recipe(recipe_ingredients_attributes: [], steps_attributes: [])

    assert_not recipe.valid?
    assert recipe.errors.added?(:recipe_ingredients, :blank)
    assert recipe.errors.added?(:steps, :blank)
  end

  test "maximaal 50 ingrediënten en 30 stappen" do
    recipe = new_recipe(
      recipe_ingredients_attributes: (1..51).map { |i| { ingredient_name: "ingrediënt #{i}" } },
      steps_attributes: (1..31).map { |i| { body: "Stap #{i}" } }
    )

    assert_not recipe.valid?
    assert recipe.errors.added?(:recipe_ingredients, :too_many, count: 50)
    assert recipe.errors.added?(:steps, :too_many, count: 30)

    recipe = new_recipe(
      recipe_ingredients_attributes: (1..50).map { |i| { ingredient_name: "ingrediënt #{i}" } },
      steps_attributes: (1..30).map { |i| { body: "Stap #{i}" } }
    )
    assert recipe.valid?
  end

  test "meer dan 100 regels wordt geweigerd voordat er iets wordt opgebouwd" do
    assert_raises(ActiveRecord::NestedAttributes::TooManyRecords) do
      new_recipe(steps_attributes: (1..101).map { |i| { body: "Stap #{i}" } })
    end
  end

  test "beschrijving is maximaal 5000 tekens" do
    assert_not new_recipe(description: "a" * 5001).valid?
  end

  test "posities volgen de volgorde van de request; een meegegeven positie telt niet" do
    recipe = new_recipe(steps_attributes: [
      { body: "Eerst", position: 7 },
      { body: "Dan", position: 1 },
      { body: "Tot slot" }
    ])
    recipe.save!

    assert_equal [ [ 1, "Eerst" ], [ 2, "Dan" ], [ 3, "Tot slot" ] ],
      recipe.reload.steps.map { |step| [ step.position, step.body ] }
  end

  test "stappen komen altijd gesorteerd op positie terug" do
    assert_equal [ 1, 2, 3 ], recipes(:pannenkoeken).steps.map(&:position)
  end

  test "fouten in regels krijgen de index uit de request" do
    recipe = new_recipe(
      recipe_ingredients_attributes: [ { ingredient_name: "bloem", quantity: 1, unit: "g" }, { ingredient_name: "" } ],
      steps_attributes: [ { body: "Goed" }, { body: "Ook goed" }, { body: " " } ]
    )

    assert_not recipe.valid?
    assert_includes recipe.errors[:"recipe_ingredients[1].ingredient_name"], "moet opgegeven zijn"
    assert_includes recipe.errors[:"steps[2].body"], "moet opgegeven zijn"
  end

  test "hetzelfde ingrediënt twee keer: de tweede regel krijgt de fout" do
    recipe = new_recipe(recipe_ingredients_attributes: [
      { ingredient_name: "Bloem", quantity: 100, unit: "g" },
      { ingredient_name: "ei", quantity: 1, unit: "stuks" },
      { ingredient_name: "  bloem ", quantity: 50, unit: "g" }
    ])

    assert_not recipe.valid?
    assert_equal [ :"recipe_ingredients[2].ingredient_name" ], recipe.errors.attribute_names
  end

  test "een ongeldig recept maakt geen ingrediënten aan" do
    recipe = new_recipe(title: "", recipe_ingredients_attributes: [ { ingredient_name: "drakenfruit" } ])

    assert_no_difference("Ingredient.count") { assert_not recipe.save }
  end

  test "opslaan maakt nieuwe ingrediënten aan en hergebruikt bestaande" do
    recipe = new_recipe(recipe_ingredients_attributes: [
      { ingredient_name: "Bloem", quantity: 100, unit: "g" },
      { ingredient_name: "Drakenfruit", quantity: 1, unit: "stuks" }
    ])

    assert_difference("Ingredient.count", 1) { recipe.save! }
    assert_equal [ "bloem", "drakenfruit" ], recipe.reload.recipe_ingredients.map(&:ingredient_name)
  end

  test "een ouder recept zonder ingrediënten en stappen blijft geldig bij een andere wijziging" do
    recipe = recipes(:erwtensoep)
    assert_empty recipe.steps

    assert recipe.update(title: "Snert")
  end

  test "bij een update mag een meegestuurde lijst niet leeg worden" do
    recipe = recipes(:pannenkoeken)
    destroy_all = recipe.steps.map { |step| { id: step.id, _destroy: "1" } }

    assert_not recipe.update(steps_attributes: destroy_all)
    assert recipe.errors.added?(:steps, :blank)
  end

  test "bij een update kunnen stappen van plek wisselen" do
    recipe = recipes(:pannenkoeken)
    first, second, third = recipe.steps.to_a

    recipe.update!(steps_attributes: [ { id: third.id }, { id: first.id } ])

    # Mentioned steps first in request order, the rest after them in their old order.
    assert_equal [ third.id, first.id, second.id ], recipe.reload.steps.map(&:id)
    assert_equal [ 1, 2, 3 ], recipe.steps.map(&:position)
  end

  test "verwijderen van een stap nummert de rest opnieuw" do
    recipe = recipes(:pannenkoeken)
    first, second, third = recipe.steps.to_a

    recipe.update!(steps_attributes: [ { id: first.id }, { id: second.id, _destroy: "1" }, { id: third.id } ])

    assert_equal [ [ first.id, 1 ], [ third.id, 2 ] ], recipe.reload.steps.map { |step| [ step.id, step.position ] }
  end

  test "verwijderen van een recept verwijdert ook de regels, maar niet de ingrediënten" do
    recipe = recipes(:pannenkoeken)

    assert_difference({ "Step.count" => -3, "RecipeIngredient.count" => -4, "Ingredient.count" => 0 }) do
      recipe.destroy!
    end
  end

  private
    def new_recipe(**attributes)
      Recipe.new({
        title: "Tomatensoep",
        servings: 2,
        recipe_ingredients_attributes: [ { ingredient_name: "tomaat", quantity: 500, unit: "g" } ],
        steps_attributes: [ { body: "Tomaten koken en pureren." } ]
      }.merge(attributes))
    end
end
