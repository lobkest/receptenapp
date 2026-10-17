class ApplicationController < ActionController::API
  include ApiErrors
  include ClientIp

  before_action :set_app_version_header

  private
    # "true", "1", true → true; "false", "0", false, "" and nil → false. As in a form.
    def boolean_param(value)
      ActiveModel::Type::Boolean.new.cast(value) || false
    end

    # Which frontend build belongs to this server (see lib/app_version.rb).
    def set_app_version_header
      version = AppVersion.current
      response.set_header(AppVersion::HEADER, version) if version
    end
end
