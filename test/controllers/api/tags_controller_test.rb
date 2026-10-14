require "test_helper"

class Api::TagsControllerTest < ActionDispatch::IntegrationTest
  test "index lists tags of visible recipes, sorted, with the number of visible recipes" do
    Recipe.create!(title: "Groentesoep", servings: 2, tag_names: %w[ vega soep ],
      recipe_ingredients_attributes: [ { ingredient_name: "prei", quantity: 1, unit: "stuks" } ],
      steps_attributes: [ { body: "Koken." } ])

    get api_tags_url, as: :json

    assert_response :ok
    # soep: Groentesoep and stamppot, not the hidden erwtensoep.
    # vega: pannenkoeken and Groentesoep, not erwtensoep.
    assert_equal [
      { "name" => "soep", "count" => 2 },
      { "name" => "vega", "count" => 2 },
      { "name" => "zoet", "count" => 1 }
    ], response.parsed_body
  end

  test "unused tags are left out" do
    get api_tags_url, as: :json

    assert_not_includes response.parsed_body.pluck("name"), "ongebruikt"
  end

  test "a tag disappears when deletion of its last recipe is requested, and returns when put back" do
    recipes(:pannenkoeken).request_deletion!

    get api_tags_url, as: :json
    assert_equal [ "soep" ], response.parsed_body.pluck("name")

    recipes(:pannenkoeken).cancel_deletion_request!

    get api_tags_url, as: :json
    assert_equal %w[ soep vega zoet ], response.parsed_body.pluck("name")
  end
end
