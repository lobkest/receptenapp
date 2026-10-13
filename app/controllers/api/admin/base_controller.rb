class Api::Admin::BaseController < ApplicationController
  include ActionController::HttpAuthentication::Token::ControllerMethods

  before_action :authenticate_admin!

  rescue_from ActiveRecord::RecordNotFound, with: :render_not_found

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
      render json: { error: "Unauthorized" }, status: :unauthorized
    end

    def render_not_found
      render json: { error: "Recipe not found" }, status: :not_found
    end
end
