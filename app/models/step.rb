class Step < ApplicationRecord
  MAX_BODY_LENGTH = 2000

  belongs_to :recipe

  # Set by Recipe#steps_attributes=, never by the client: the step's place in the request.
  attr_accessor :request_order

  normalizes :body, with: ->(body) { body.strip }

  validates :body, presence: true, length: { maximum: MAX_BODY_LENGTH }
  validates :position, numericality: { only_integer: true, greater_than: 0 }
end
