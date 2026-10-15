class Api::Admin::BaseController < ApplicationController
  include ActionController::HttpAuthentication::Token::ControllerMethods

  # Against guessing the code: at most this many admin requests per minute per visitor
  # (client_ip, see ClientIp), right or wrong code alike. Counting only wrong codes would
  # not help: a guesser would then simply keep going until one request does not get a
  # 429. A real admin makes about two requests per action (the action, then the list
  # again), so 10 allows a few actions a minute. Configurable so the e2e tests can raise it.
  REQUESTS_PER_MINUTE = Integer(ENV.fetch("ADMIN_REQUESTS_PER_MINUTE", 10))

  # Before authenticate_admin!, so a refused request is not even checked. scope: one
  # counter for all admin controllers; by default each controller would have its own.
  rate_limit to: REQUESTS_PER_MINUTE, within: 1.minute, scope: "admin", by: -> { client_ip },
    with: -> { render_error :too_many_requests, I18n.t("admin.rate_limited") }

  before_action :authenticate_admin!

  # E.g. a version the current rules refuse. Everything ran in one transaction, so
  # nothing has changed. Not-found, conflict and the rest: ApiErrors.
  rescue_from ActiveRecord::RecordInvalid do |error|
    render_invalid error.record,
      message: I18n.t("admin.restore_failed", reasons: error.record.errors.full_messages.to_sentence)
  end

  private
    def authenticate_admin!
      render_unauthorized unless valid_admin_token?
    end

    # Fails closed: without ADMIN_TOKEN configured, every request is refused.
    def valid_admin_token?
      expected = ENV["ADMIN_TOKEN"]
      return false if expected.blank?

      authenticate_with_http_token do |token, _options|
        ActiveSupport::SecurityUtils.secure_compare(token, expected)
      end
    end

    def render_unauthorized
      headers["WWW-Authenticate"] = 'Bearer realm="Admin"'
      render_error :unauthorized, I18n.t("admin.unauthorized")
    end
end
