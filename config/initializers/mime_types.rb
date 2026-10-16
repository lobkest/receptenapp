# The PWA's web manifest (public/manifest.webmanifest, built by vite-plugin-pwa). Rack does
# not know the extension and would serve it as text/plain.
Rack::Mime::MIME_TYPES[".webmanifest"] = "application/manifest+json"
