class ApplicationController < ActionController::API
  include ApiErrors
  include ClientIp

  before_action :set_app_version_header

  private
    # Which frontend build belongs to this server (see lib/app_version.rb).
    def set_app_version_header
      version = AppVersion.current
      response.set_header(AppVersion::HEADER, version) if version
    end
end
