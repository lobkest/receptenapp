require "test_helper"

class Api::NevoFoodsControllerTest < ActionDispatch::IntegrationTest
  test "searches name and synonym, with the readable name and values per 100" do
    get api_nevo_foods_url(q: "kippenei"), as: :json

    assert_response :ok
    assert_equal [ { "id" => nevo_foods(:kippenei).id, "code" => 83, "name" => "Kippeneieren rauw",
                     "official_name" => "Ei kippen- rauw gem", "unit" => "g", "version" => "2025/9.0",
                     "kcal" => 130, "protein" => 12, "carbohydrates" => 0, "fat" => 9, "fiber" => nil } ], response.parsed_body
  end

  test "without a search: nothing" do
    get api_nevo_foods_url, as: :json

    assert_response :ok
    assert_equal [], response.parsed_body
  end
end
