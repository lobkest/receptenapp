require "test_helper"

class NoCachePublicFilesTest < ActiveSupport::TestCase
  # Stands in for ActionDispatch::Static serving a file from public/ with the
  # far-future header of production.rb.
  STATIC = ->(_env) { [ 200, { "cache-control" => "public, max-age=31536000" }, [ "file" ] ] }
  MISSING = ->(_env) { [ 404, { "cache-control" => "public, max-age=31536000" }, [ "" ] ] }

  def cache_control(app, path)
    _status, headers, _body = NoCachePublicFiles.new(app).call(Rack::MockRequest.env_for(path))
    headers["cache-control"]
  end

  test "service worker and manifest are revalidated on every request" do
    assert_equal "no-cache", cache_control(STATIC, "/sw.js")
    assert_equal "no-cache", cache_control(STATIC, "/manifest.webmanifest")
  end

  test "hashed assets and icons keep the far-future header" do
    assert_equal "public, max-age=31536000", cache_control(STATIC, "/assets/index-abc123.js")
    assert_equal "public, max-age=31536000", cache_control(STATIC, "/icon-192.png")
  end

  test "leaves error responses alone" do
    assert_equal "public, max-age=31536000", cache_control(MISSING, "/sw.js")
  end

  test "sits in front of ActionDispatch::Static" do
    middleware = Rails.application.middleware.map(&:klass)

    assert_operator middleware.index(NoCachePublicFiles), :<, middleware.index(ActionDispatch::Static)
  end

  test "the web manifest has its own content type" do
    assert_equal "application/manifest+json", Rack::Mime.mime_type(".webmanifest")
  end
end
