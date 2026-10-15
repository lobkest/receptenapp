require "test_helper"

# On Render every request comes in through Cloudflare, so request.remote_ip is a Cloudflare
# server, shared by many visitors. The rate limits count per visitor instead: the
# CF-Connecting-IP header that Cloudflare sets, or remote_ip without it (locally, tests).
class Api::ClientIpRateLimitTest < ActionDispatch::IntegrationTest
  TEST_TOKEN = "test-admin-token"

  setup do
    @original_admin_token = ENV["ADMIN_TOKEN"]
    ENV["ADMIN_TOKEN"] = TEST_TOKEN
    Rails.cache.clear # reset rate_limit counters
  end

  teardown do
    ENV["ADMIN_TOKEN"] = @original_admin_token
  end

  test "admin: the 11th try from the same visitor gets a 429, another visitor has its own counter" do
    10.times { admin_request(cf: "198.51.100.1") }
    assert_response :unauthorized

    admin_request(cf: "198.51.100.1")
    assert_response :too_many_requests

    # Same Cloudflare server (remote_ip 127.0.0.1 here), another visitor.
    admin_request(cf: "198.51.100.2")
    assert_response :unauthorized
  end

  test "admin: without CF-Connecting-IP the limit counts per remote_ip" do
    10.times { admin_request }

    admin_request
    assert_response :too_many_requests

    admin_request(remote_addr: "203.0.113.9")
    assert_response :unauthorized
  end

  test "public writes: every visitor has its own counter" do
    PublicWriteRateLimit::WRITES_PER_MINUTE.times { clear_checked(cf: "198.51.100.1") }
    assert_response :no_content

    clear_checked(cf: "198.51.100.1")
    assert_response :too_many_requests

    clear_checked(cf: "198.51.100.2")
    assert_response :no_content
  end

  test "public writes: without CF-Connecting-IP the limit counts per remote_ip" do
    PublicWriteRateLimit::WRITES_PER_MINUTE.times { clear_checked }

    clear_checked
    assert_response :too_many_requests

    clear_checked(remote_addr: "203.0.113.9")
    assert_response :no_content
  end

  test "recipe submissions: every visitor has its own counter" do
    Api::RecipesController::SUBMISSIONS_PER_HOUR.times { submit_recipe(cf: "198.51.100.1") }
    assert_response :unprocessable_content # an empty title: still counts as a submission

    submit_recipe(cf: "198.51.100.1")
    assert_response :too_many_requests

    submit_recipe(cf: "198.51.100.2")
    assert_response :unprocessable_content
  end

  private
    def admin_request(cf: nil, remote_addr: nil)
      get api_admin_deletion_requests_url, as: :json,
        headers: client_headers(cf).merge("Authorization" => "Bearer wrong-code"),
        env: remote_addr ? { "REMOTE_ADDR" => remote_addr } : {}
    end

    def clear_checked(cf: nil, remote_addr: nil)
      delete clear_checked_api_shopping_list_items_url, as: :json, headers: client_headers(cf),
        env: remote_addr ? { "REMOTE_ADDR" => remote_addr } : {}
    end

    def submit_recipe(cf:)
      post api_recipes_url, as: :json, headers: client_headers(cf), params: { recipe: { title: "" } }
    end

    def client_headers(cf)
      cf ? { "CF-Connecting-IP" => cf } : {}
    end
end
