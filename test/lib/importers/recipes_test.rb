require "test_helper"

class Importers::RecipesTest < ActiveSupport::TestCase
  def recipe_row(**overrides)
    {
      "title" => "Orzo uit de oven",
      "servings" => 4,
      "category" => "diner",
      "description" => "Geschat.",
      "tags" => [ "Snel" ],
      "ingredients" => [
        { "name" => "  BLOEM ", "quantity" => 100, "unit" => "g" },
        { "name" => "Orzo", "quantity" => 320, "unit" => "g" },
        { "name" => "Parmaham", "quantity" => 90, "unit" => "g", "optional" => true },
        { "name" => "Zout" }
      ],
      "steps" => [ "Alles in de oven." ],
      "variations" => [
        { "name" => "Met zalm", "remove" => [ "parmaham" ], "add" => [ { "name" => "Zalm", "quantity" => 90, "unit" => "g" } ] }
      ]
    }.merge(overrides.transform_keys(&:to_s))
  end

  test "maakt het recept met ingrediënten, stappen, tags, categorie en variaties" do
    report = Importers::Recipes.call([ recipe_row ])

    assert_equal [ "Orzo uit de oven" ], report.created.map(&:label)
    recipe = Recipe.find_by!(title: "Orzo uit de oven")
    assert_equal categories(:diner), recipe.category
    assert_equal [ "snel" ], recipe.tag_names
    assert_equal [ "bloem", "orzo", "parmaham", "zout" ], recipe.recipe_ingredients.map(&:ingredient_name)
    assert recipe.recipe_ingredients.third.optional
    assert_nil recipe.recipe_ingredients.last.quantity
    assert_equal [ "Alles in de oven." ], recipe.steps.map(&:body)

    variation = recipe.variations.sole
    assert_equal [ "parmaham" ], variation.removals.map(&:ingredient_name)
    assert_equal [ [ "zalm", BigDecimal(90), "g" ] ], variation.additions.map { |row| [ row.name, row.quantity, row.unit ] }
  end

  test "legt versiegeschiedenis vast: het recept en daarna de variaties" do
    Importers::Recipes.call([ recipe_row ])
    recipe = Recipe.find_by!(title: "Orzo uit de oven")

    assert_equal [ "Gewijzigd: variaties", "Eerste versie" ], recipe.versions.newest_first.map(&:summary)
    assert_equal [ "Met zalm" ], recipe.versions.newest_first.first.snapshot["variations"].map { |data| data["name"] }
  end

  test "matcht ingrediënten ongeacht hoofdletters en meldt alleen de nieuwe" do
    # orzo and parmaham from the recipe, zalm from its variation (VariationChange makes it).
    report = assert_difference("Ingredient.count", 3) { Importers::Recipes.call([ recipe_row ]) }

    assert_equal ingredients(:bloem), Recipe.find_by!(title: "Orzo uit de oven").recipe_ingredients.first.ingredient
    assert_equal [ "orzo", "parmaham" ], report.new_ingredients
    assert_empty report.new_categories
  end

  test "twee keer importeren maakt niets dubbel, ook niet bij een titel in andere hoofdletters" do
    Importers::Recipes.call([ recipe_row ])

    assert_no_difference [ "Recipe.count", "Ingredient.count", "RecipeVariation.count", "RecipeVersion.count" ] do
      report = Importers::Recipes.call([ recipe_row(title: "  orzo UIT de oven ") ])
      assert_equal [ "titel bestaat al" ], report.skipped.map(&:reason)
    end
  end

  test "dry-run schrijft niets weg maar rapporteert wel" do
    report = assert_no_difference [ "Recipe.count", "Ingredient.count", "Category.count", "RecipeVersion.count" ] do
      Importers::Recipes.call([ recipe_row(category: "Bijgerecht") ], dry_run: true)
    end

    assert_equal 1, report.created.size
    assert_equal [ "orzo", "parmaham" ], report.new_ingredients
    assert_equal [ "Bijgerecht" ], report.new_categories
  end

  test "accepteert stuks, weigert andere eenheden dan g, ml, stuks, tl of el, ook in variaties" do
    rows = [
      recipe_row(title: "Met cup", ingredients: [ { "name" => "Olie", "quantity" => 1, "unit" => "cup" } ]),
      recipe_row(title: "Met snufje", variations: [ { "name" => "Pittig", "add" => [ { "name" => "Sambal", "quantity" => 1, "unit" => "snufje" } ] } ]),
      recipe_row(title: "Met stuks", ingredients: [ { "name" => "Ei", "quantity" => 2, "unit" => "stuks" } ], variations: [])
    ]
    report = assert_difference("Recipe.count", 1) { Importers::Recipes.call(rows) }

    assert_equal [ "Met stuks" ], report.created.map(&:label)
    assert_equal [ [ BigDecimal(2), "stuks" ] ], Recipe.find_by!(title: "Met stuks").recipe_ingredients.map { |row| [ row.quantity, row.unit ] }
    assert_equal [ "ingrediënt 'Olie': eenheid 'cup' niet toegestaan (alleen g, ml, stuks, tl of el)",
      "variatie Pittig 'Sambal': eenheid 'snufje' niet toegestaan (alleen g, ml, stuks, tl of el)" ], report.failed.map(&:reason)
  end

  test "een validatiefout slaat alleen dat recept over en laat niets half achter" do
    rows = [
      recipe_row(title: "Zonder stappen", steps: []),
      recipe_row(title: "Foute variatie", variations: [ { "name" => "Zonder", "remove" => [ "kaas" ] } ]),
      recipe_row(title: "Te veel porties", servings: 500),
      recipe_row(title: "Typfout", ingredient: []),
      recipe_row
    ]
    report = assert_difference([ "Recipe.count", "RecipeVariation.count" ], 1) { Importers::Recipes.call(rows) }

    assert_equal [ 1, 2, 3, 4 ], report.failed.map(&:line)
    assert_includes report.failed[0].reason, "Stappen"
    assert_equal "variatie Zonder: 'kaas' staat niet in het recept", report.failed[1].reason
    assert_includes report.failed[2].reason, "Porties"
    assert_equal "recept: onbekende velden ingredient", report.failed[3].reason
    assert_nil Recipe.find_by(title: "Foute variatie")
  end
end
