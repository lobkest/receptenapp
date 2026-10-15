# Who is this visitor, for the rate limits (Api::Admin::BaseController, PublicWriteRateLimit).
#
# On Render every request reaches the app through Cloudflare. Rails does not know the
# Cloudflare servers as proxies, so request.remote_ip is the Cloudflare server, shared by
# many visitors: the limits counted per Cloudflare server, not per visitor. Cloudflare
# puts the visitor's address in CF-Connecting-IP, and replaces any value the visitor sent.
#
# Assumption: all traffic goes through Cloudflare. Then this header cannot be faked.
# If the app were reachable without Cloudflare, a client could send a different value
# with every request and get a fresh counter each time: the limit would then be weaker
# than counting per remote_ip. Without the header (locally, in tests) remote_ip is used.
module ClientIp
  extend ActiveSupport::Concern

  private
    def client_ip
      request.headers["CF-Connecting-IP"].presence || request.remote_ip
    end
end
