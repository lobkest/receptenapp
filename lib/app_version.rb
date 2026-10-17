# The version of the frontend build that is deployed with this server. `npm run build`
# writes it to frontend/dist/version.json (see frontend/vite.config.js), the same string
# that is baked into the JavaScript bundle. Every API response carries it in the
# X-App-Version header (ApplicationController); a browser still running an older bundle
# sees the difference and reloads itself.
#
# nil when there is no build (development without `npm run build`, the test environment):
# then no header is sent and the browser never reloads.
module AppVersion
  HEADER = "X-App-Version".freeze

  # Read once per process: a deploy restarts the server, and with it this cache.
  def self.current
    return @current if defined?(@current)

    @current = read
  end

  # For tests that point config.x.frontend_version_file somewhere else.
  def self.reset!
    remove_instance_variable(:@current) if defined?(@current)
  end

  def self.read
    path = Rails.configuration.x.frontend_version_file
    return nil if path.blank? || !File.exist?(path)

    JSON.parse(File.read(path))["version"].presence
  rescue JSON::ParserError
    nil
  end
  private_class_method :read
end
