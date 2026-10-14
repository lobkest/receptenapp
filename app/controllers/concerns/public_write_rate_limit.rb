# The shopping list and the standard list are open to anyone with the link, so every
# request that changes something counts towards one limit per IP, shared by all
# controllers that use it (scope). Reading is never limited.
#
# Configurable so the e2e tests can raise it; without the variable it is 120 per minute,
# far more than a person ticking off groceries needs.
#
#   include PublicWriteRateLimit
#   limit_public_writes only: %i[ create update destroy ]
module PublicWriteRateLimit
  extend ActiveSupport::Concern

  WRITES_PER_MINUTE = Integer(ENV.fetch("PUBLIC_WRITES_PER_MINUTE", 120))

  class_methods do
    # Explicit actions: Rails refuses an except: list that names actions a controller lacks.
    def limit_public_writes(only:)
      rate_limit to: WRITES_PER_MINUTE, within: 1.minute, scope: "public-writes", only: only,
        with: -> { render json: { error: I18n.t("api.too_many_requests") }, status: :too_many_requests }
    end
  end
end
