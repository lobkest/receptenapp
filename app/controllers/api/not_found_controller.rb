# Catch-all for unknown /api routes, so they answer with JSON instead of HTML.
class Api::NotFoundController < ApplicationController
  def show
    render_error :not_found, I18n.t("api.route_not_found")
  end
end
