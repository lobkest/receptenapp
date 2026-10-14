# Anyone may ask to delete something; only the admin deletes it for good. Until then it is
# hidden from the public (scope :visible) and listed for the admin (scope :deletion_requested).
# Needs the columns deletion_requested_at (datetime) and deletion_reason (string).
#
# Used by Recipe; meant for recipe variations later on as well.
module DeletionRequestable
  extend ActiveSupport::Concern

  MAX_REASON_LENGTH = 500

  included do
    scope :visible, -> { where(deletion_requested_at: nil) }
    scope :deletion_requested, -> { where.not(deletion_requested_at: nil) }

    validates :deletion_reason, length: { maximum: MAX_REASON_LENGTH }
  end

  def deletion_requested?
    deletion_requested_at.present?
  end

  # reason is optional; empty or only spaces is stored as nil.
  def request_deletion!(reason = nil)
    update!(deletion_requested_at: Time.current, deletion_reason: reason.to_s.squish.presence)
  end

  # The admin decided to keep it: visible again, request forgotten.
  def cancel_deletion_request!
    update!(deletion_requested_at: nil, deletion_reason: nil)
  end
end
