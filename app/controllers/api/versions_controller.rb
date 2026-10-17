class Api::VersionsController < ApplicationController
  # GET /api/version
  # The frontend build deployed with this server, also sent as the X-App-Version header
  # on every API response. null without a build (development, tests).
  def show
    render json: { version: AppVersion.current }
  end
end
