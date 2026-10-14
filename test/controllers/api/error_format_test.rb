require "test_helper"

# Every error from the API has the same shape:
#   { "error": "<Dutch message for the whole request>", "errors": { "<field>": [ "<message>" ] } }
# errors is {} when no single field is to blame. The frontend reads this in one place
# (frontend/src/api/client.js).
class Api::ErrorFormatTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear # reset rate_limit counters
    @recipe = recipes(:pannenkoeken)
  end

  test "404 for a record names what was not found" do
    get api_recipe_url(id: 0), as: :json
    assert_response :not_found
    assert_equal({ "error" => "Recept niet gevonden.", "errors" => {} }, response.parsed_body)

    patch api_recipe_variation_url(@recipe, id: 0), as: :json, params: { variation: { lock_version: 0 } }
    assert_equal({ "error" => "Variatie niet gevonden.", "errors" => {} }, response.parsed_body)

    delete api_shopping_list_item_url(id: 0), as: :json
    assert_equal({ "error" => "Boodschap niet gevonden.", "errors" => {} }, response.parsed_body)

    delete api_standard_item_url(id: 0), as: :json
    assert_equal({ "error" => "Standaarditem niet gevonden.", "errors" => {} }, response.parsed_body)
  end

  test "404 for an unknown API path" do
    get "/api/bestaat-niet", as: :json

    assert_response :not_found
    assert_equal({ "error" => "Dit adres bestaat niet.", "errors" => {} }, response.parsed_body)
  end

  test "422 has a general message and the messages per field" do
    post api_recipes_url, as: :json, params: { recipe: { title: "", servings: 4 } }

    assert_response :unprocessable_content
    body = response.parsed_body
    assert_equal "Controleer de ingevulde velden.", body["error"]
    assert_equal [ "moet opgegeven zijn" ], body["errors"]["title"]
  end

  test "422 for one line of several names its place in the request" do
    post api_shopping_list_items_url, as: :json,
      params: { shopping_list_items: [ { name: "melk" }, { name: "" } ] }

    assert_response :unprocessable_content
    assert_equal [ "moet opgegeven zijn" ], response.parsed_body["errors"]["shopping_list_items[1].name"]
    assert_equal "Controleer de ingevulde velden.", response.parsed_body["error"]
  end

  test "400 when a required part is missing names that part" do
    patch api_recipe_url(@recipe), as: :json, params: { recipe: { title: "Zonder versie" } }

    assert_response :bad_request
    assert_equal({ "error" => "Er ontbreekt iets in het verzoek: lock_version.",
      "errors" => { "lock_version" => [ "moet opgegeven zijn" ] } }, response.parsed_body)
  end

  test "409 says someone else changed it" do
    patch api_recipe_url(@recipe), as: :json, params: { recipe: { lock_version: 0, title: "Eerst" } }
    patch api_recipe_url(@recipe), as: :json, params: { recipe: { lock_version: 0, title: "Daarna" } }

    assert_response :conflict
    assert_equal({ "error" => "Dit recept is intussen door iemand anders gewijzigd. Herlaad en probeer opnieuw.",
      "errors" => {} }, response.parsed_body)
  end

  test "429 says to wait" do
    (PublicWriteRateLimit::WRITES_PER_MINUTE + 1).times { delete clear_checked_api_shopping_list_items_url, as: :json }

    assert_response :too_many_requests
    assert_equal({ "error" => "Te veel verzoeken. Probeer het over een minuut opnieuw.", "errors" => {} },
      response.parsed_body)
  end

  test "401 for the admin" do
    get api_admin_deletion_requests_url, as: :json, headers: { "Authorization" => "Bearer fout" }

    assert_response :unauthorized
    assert_equal({ "error" => "De beheercode is onjuist of verlopen.", "errors" => {} }, response.parsed_body)
  end
end
