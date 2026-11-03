require "test_helper"

# "Tijdelijk" on the standard list through the API: a loose item on the shopping list
# (POST /api/shopping_list_items/add), the standard list's own button, expiry when the list
# is fetched, and making an item permanent with the edit form.
class Api::StandardItemsTemporaryTest < ActionDispatch::IntegrationTest
  def add_loose(name, **extra)
    post add_api_shopping_list_items_url, params: { name: name, **extra }, as: :json
  end

  def temporary_item(name)
    StandardItem.temporary.find_by(name: name)
  end

  test "een los item komt onder Tijdelijk op de standaardlijst" do
    freeze_time do
      assert_difference("StandardItem.count", 1) { add_loose(" Verse Dille ") }

      assert_response :created
      assert_equal Time.current, temporary_item("verse dille").temporary_last_used_at
    end
  end

  test "een los item met een gekozen ingrediënt gebruikt de naam van het ingrediënt" do
    ingredient = Ingredient.create!(name: "koriander")

    add_loose("kor", ingredient_id: ingredient.id)

    assert temporary_item("koriander")
  end

  test "een naam die al op de standaardlijst staat komt niet onder Tijdelijk" do
    assert_no_difference("StandardItem.count") { add_loose("MELK") }

    assert_not standard_items(:melk).reload.temporary?
  end

  test "hetzelfde losse item nog een keer: geen tweede, wel een nieuw tijdstip" do
    travel_to(Time.zone.local(2026, 9, 1, 12)) { add_loose("dille") }

    travel_to(Time.zone.local(2026, 10, 1, 12)) do
      assert_no_difference("StandardItem.count") { add_loose("dille") }
      assert_equal Time.current, temporary_item("dille").temporary_last_used_at
    end
  end

  test "een offline actie die twee keer komt, telt één keer" do
    action_id = SecureRandom.uuid
    2.times { add_loose("dille", client_action_id: action_id) }

    assert_equal 1, StandardItem.where(name: "dille").count
  end

  test "een ongeldig los item zet ook niets op de standaardlijst" do
    assert_no_difference("StandardItem.count") { add_loose("dille", count: 0) }

    assert_response :unprocessable_content
  end

  test "op lijst vanaf de standaardlijst werkt het tijdstip bij" do
    item = travel_to(Time.zone.local(2026, 9, 1, 12)) { StandardItem.note_used!("dille") }

    travel_to(Time.zone.local(2026, 10, 1, 12)) do
      post add_to_shopping_list_api_standard_items_url, params: { ids: [ item.id ] }, as: :json
      assert_equal Time.current, item.reload.temporary_last_used_at
    end
  end

  test "op lijst offline (op naam) werkt het tijdstip ook bij" do
    item = travel_to(Time.zone.local(2026, 9, 1, 12)) { StandardItem.note_used!("dille") }

    travel_to(Time.zone.local(2026, 10, 1, 12)) do
      post add_to_shopping_list_api_standard_items_url, params: { names: [ "Dille" ] }, as: :json
      assert_equal Time.current, item.reload.temporary_last_used_at
    end
  end

  test "de standaardlijst ophalen verwijdert verlopen tijdelijke items" do
    expired = travel_to(Time.zone.local(2026, 9, 1, 12)) { StandardItem.note_used!("dille") }
    fresh = travel_to(Time.zone.local(2026, 10, 1, 12)) { StandardItem.note_used!("bieslook") }

    travel_to(Time.zone.local(2026, 11, 2, 12)) { get api_standard_items_url, as: :json }

    names = response.parsed_body.map { |item| item["name"] }
    assert_not_includes names, "dille"
    assert_includes names, "bieslook"
    assert_not StandardItem.exists?(expired.id)
    assert_equal fresh.temporary_last_used_at.iso8601(3),
      response.parsed_body.find { |item| item["name"] == "bieslook" }["temporary_last_used_at"]
  end

  test "de offline snapshot laat verlopen tijdelijke items weg" do
    travel_to(Time.zone.local(2026, 9, 1, 12)) { StandardItem.note_used!("dille") }

    travel_to(Time.zone.local(2026, 11, 2, 12)) { get api_offline_snapshot_url, as: :json }

    assert_not_includes response.parsed_body["standard_items"].map { |item| item["name"] }, "dille"
  end

  test "verplaatsen naar een categorie maakt het item permanent" do
    item = StandardItem.note_used!("dille")

    patch api_standard_item_url(item), params: { standard_item: { name: "dille", category: "kruiden" } }, as: :json

    assert_response :ok
    assert_nil response.parsed_body["temporary_last_used_at"]
    assert_not item.reload.temporary?
  end

  test "temporary: false maakt het item permanent zonder categorie" do
    item = StandardItem.note_used!("dille")

    patch api_standard_item_url(item), params: { standard_item: { name: "dille", category: nil, temporary: false } }, as: :json

    assert_response :ok
    assert_not item.reload.temporary?
  end

  test "alleen de naam wijzigen houdt het item tijdelijk" do
    item = StandardItem.note_used!("dille")

    patch api_standard_item_url(item), params: { standard_item: { name: "verse dille", category: nil } }, as: :json

    assert_response :ok
    assert item.reload.temporary?
  end

  test "een categorie met de naam Tijdelijk wordt geweigerd, met een Nederlandse melding" do
    assert_no_difference("StandardItem.count") do
      post api_standard_items_url, params: { standard_item: { name: "dille", category: "tijdelijk" } }, as: :json
    end

    assert_response :unprocessable_content
    assert_includes response.parsed_body.dig("errors", "category"), 'kan niet "Tijdelijk" zijn, die naam is gereserveerd'
  end
end
