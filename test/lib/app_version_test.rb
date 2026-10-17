require "test_helper"

class AppVersionTest < ActionDispatch::IntegrationTest
  setup do
    @original = Rails.configuration.x.frontend_version_file
    @dir = Dir.mktmpdir
    AppVersion.reset!
  end

  teardown do
    Rails.configuration.x.frontend_version_file = @original
    AppVersion.reset!
    FileUtils.remove_entry(@dir)
  end

  def use_version_file(content)
    path = File.join(@dir, "version.json")
    File.write(path, content)
    Rails.configuration.x.frontend_version_file = path
  end

  test "reads the version from the frontend build" do
    use_version_file({ version: "abc1234" }.to_json)

    assert_equal "abc1234", AppVersion.current
  end

  test "is nil without a build, or with a broken file" do
    Rails.configuration.x.frontend_version_file = File.join(@dir, "missing.json")
    assert_nil AppVersion.current

    AppVersion.reset!
    use_version_file("{ half")
    assert_nil AppVersion.current
  end

  test "every API response carries the version, errors included" do
    use_version_file({ version: "abc1234" }.to_json)

    get api_tags_url, as: :json
    assert_response :ok
    assert_equal "abc1234", response.headers["X-App-Version"]

    get "/api/bestaat-niet", as: :json
    assert_response :not_found
    assert_equal "abc1234", response.headers["X-App-Version"]
  end

  test "GET /api/version returns the version" do
    use_version_file({ version: "abc1234" }.to_json)

    get api_version_url, as: :json

    assert_response :ok
    assert_equal({ "version" => "abc1234" }, response.parsed_body)
  end

  test "without a build there is no header and the version is null" do
    get api_version_url, as: :json

    assert_response :ok
    assert_equal({ "version" => nil }, response.parsed_body)
    assert_nil response.headers["X-App-Version"]
  end
end
