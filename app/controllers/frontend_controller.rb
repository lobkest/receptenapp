# Serves the Vue single-page app. Vue Router takes over in the browser, so every
# HTML route (/, /recepten/2, ...) gets the same index.html.
class FrontendController < ApplicationController
  def index
    path = Rails.configuration.x.frontend_index

    if File.exist?(path)
      # no-cache: the browser must revalidate, so a deploy is picked up immediately.
      response.headers["Cache-Control"] = "no-cache"
      render html: File.read(path).html_safe
    else
      render plain: "Frontend not built. Run `npm run build` in frontend/.", status: :not_found
    end
  end
end
