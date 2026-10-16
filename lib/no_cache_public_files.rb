# The PWA's service worker (sw.js) and web manifest live in public/ next to the hashed
# assets, so ActionDispatch::Static would give them the far-future cache-control from
# config.public_file_server.headers. Their names never change, though: cached for a year
# (by Cloudflare, say) a deploy would never reach the phones. This middleware sits in front
# of ActionDispatch::Static and makes browsers and proxies revalidate just these files.
class NoCachePublicFiles
  PATHS = %w[ /sw.js /manifest.webmanifest ].freeze

  def initialize(app)
    @app = app
  end

  def call(env)
    status, headers, body = @app.call(env)
    headers["cache-control"] = "no-cache" if PATHS.include?(env["PATH_INFO"]) && status == 200
    [ status, headers, body ]
  end
end
