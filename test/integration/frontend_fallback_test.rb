require "test_helper"

class FrontendFallbackTest < ActionDispatch::IntegrationTest
  test "root returns the frontend's index.html" do
    get "/", headers: { "Accept" => "text/html" }

    assert_response :ok
    assert_equal "text/html", response.media_type
    assert_includes response.body, '<div id="app"></div>'
    assert_equal "no-cache", response.headers["Cache-Control"]
  end

  test "deep links return index.html so Vue Router can render them" do
    [ "/recepten/nieuw", "/recepten/2" ].each do |path|
      get path, headers: { "Accept" => "text/html" }

      assert_response :ok, path
      assert_includes response.body, '<div id="app"></div>', path
    end
  end

  test "unknown api route returns a JSON 404, also for browsers" do
    get "/api/onbestaand", headers: { "Accept" => "text/html" }

    assert_response :not_found
    assert_equal "application/json", response.media_type
    assert_equal({ "error" => "Not found" }, response.parsed_body)
  end

  test "missing asset is a 404, not index.html" do
    get "/assets/onbestaand.js"

    assert_response :not_found
    assert_not_includes response.body, '<div id="app"></div>'
  end

  test "health check is not caught by the fallback" do
    get "/up"

    assert_response :ok
    assert_not_includes response.body, '<div id="app"></div>'
  end
end
