require "test_helper"

class Api::CategoriesControllerTest < ActionDispatch::IntegrationTest
  test "index lists all categories by position, also those without recipes" do
    Category.create!(name: "Brunch", position: 0)

    get api_categories_url, as: :json

    assert_response :ok
    assert_equal %w[ Brunch Ontbijt Lunch Diner Snacks ], response.parsed_body.pluck("name")
    assert_equal({ "id" => categories(:ontbijt).id, "name" => "Ontbijt", "position" => 1 }, response.parsed_body.second)
  end

  test "the same position is ordered by id" do
    later = Category.create!(name: "Toetjes", position: 4)

    get api_categories_url, as: :json

    assert_equal [ categories(:snacks).id, later.id ], response.parsed_body.last(2).pluck("id")
  end
end
