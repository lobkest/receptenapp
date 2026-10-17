require_relative "boot"

require "rails/all"
require_relative "../lib/no_cache_public_files"

# Require the gems listed in Gemfile, including any gems
# you've limited to :test, :development, or :production.
Bundler.require(*Rails.groups)

module Receptenapp
  class Application < Rails::Application
    # Initialize configuration defaults for originally generated Rails version.
    config.load_defaults 8.1

    # Please, add to the `ignore` list any other `lib` subdirectories that do
    # not contain `.rb` files, or that should not be reloaded or eager loaded.
    # Common ones are `templates`, `generators`, or `middleware`, for example.
    config.autoload_lib(ignore: %w[assets tasks])

    # Configuration for the application, engines, and railties goes here.
    #
    # These settings can be overridden in specific environments using the files
    # in config/environments, which are processed later.
    #
    # config.time_zone = "Central Time (US & Canada)"
    # config.eager_load_paths << Rails.root.join("extras")

    # Only loads a smaller set of middleware suitable for API only apps.
    # Middleware like session, flash, cookies can be added back manually.
    # Skip views, helpers and assets when generating a new resource.
    config.api_only = true

    # Error messages in Dutch. rails-i18n has the standard texts ("is geen getal"),
    # config/locales/nl.yml the attribute names and the app's own messages.
    config.i18n.available_locales = %i[ nl en ]
    config.i18n.default_locale = :nl

    # The built index.html of the Vue app (see bin/render-build.sh and FrontendController).
    config.x.frontend_index = Rails.root.join("frontend/dist/index.html")
    # Its version, sent along with every API response (see lib/app_version.rb).
    config.x.frontend_version_file = Rails.root.join("frontend/dist/version.json")

    # The service worker and web manifest of the PWA must never be cached for long.
    config.middleware.insert_before ActionDispatch::Static, NoCachePublicFiles
  end
end
