class Recipe < ApplicationRecord
  MAX_INGREDIENTS = 50
  MAX_STEPS = 30
  # Hard cap, checked before any row is built. Above this the request gets a 422 at once.
  MAX_NESTED_ROWS = 100
  MAX_DESCRIPTION_LENGTH = 5000
  # Same as the most the recipe page lets you scale to.
  MAX_SERVINGS = 50

  enum :status, { pending: "pending", approved: "approved", rejected: "rejected" }, default: :pending, validate: true

  # index_errors: errors read "steps[2].body", where 2 is the place in the request.
  has_many :steps, -> { order(:position) }, dependent: :destroy, inverse_of: :recipe,
    index_errors: :nested_attributes_order
  has_many :recipe_ingredients, -> { order(:id) }, dependent: :destroy, inverse_of: :recipe,
    index_errors: :nested_attributes_order

  accepts_nested_attributes_for :steps, allow_destroy: true, limit: MAX_NESTED_ROWS
  accepts_nested_attributes_for :recipe_ingredients, allow_destroy: true, limit: MAX_NESTED_ROWS

  scope :with_details, -> { includes(:steps, recipe_ingredients: :ingredient) }

  before_validation :number_steps

  validates :title, presence: true, length: { maximum: 150 }
  validates :description, length: { maximum: MAX_DESCRIPTION_LENGTH }
  validates :servings, numericality: { only_integer: true, greater_than: 0, less_than_or_equal_to: MAX_SERVINGS }
  validate :row_counts

  after_save :forget_submitted_lists

  # Remembers each step's place in the request, so positions follow the submitted order.
  def steps_attributes=(attributes)
    @steps_submitted = true
    attributes = attributes.to_h if attributes.respond_to?(:permitted?)
    attributes = attributes.values if attributes.is_a?(Hash) && !attributes.key?("id") && !attributes.key?(:id)

    super(Array.wrap(attributes).each_with_index.map { |step, index| step.to_h.merge("request_order" => index) })
  end

  def recipe_ingredients_attributes=(attributes)
    @recipe_ingredients_submitted = true
    super
  end

  private
    # Positions are always 1..n, decided here. Steps in the request come first, in request
    # order; steps the request did not mention follow in their old order.
    def number_steps
      return unless new_record? || @steps_submitted

      kept = steps.reject(&:marked_for_destruction?)
      ordered = kept.each_with_index.sort_by { |step, index| step.request_order ? [ 0, step.request_order ] : [ 1, index ] }
      ordered.each_with_index { |(step, _), index| step.position = index + 1 }
    end

    def forget_submitted_lists
      @steps_submitted = @recipe_ingredients_submitted = false
      association(:steps).target.each { |step| step.request_order = nil }
    end

    # New recipes need at least one ingredient and one step. Older recipes have neither,
    # so on update the minimum only applies to a list the request actually sends.
    def row_counts
      check_row_count(:recipe_ingredients, maximum: MAX_INGREDIENTS, required: new_record? || @recipe_ingredients_submitted)
      check_row_count(:steps, maximum: MAX_STEPS, required: new_record? || @steps_submitted)
    end

    def check_row_count(association, maximum:, required:)
      count = public_send(association).reject(&:marked_for_destruction?).size

      if required && count.zero?
        errors.add(association, :blank)
      elsif count > maximum
        errors.add(association, :too_many, count: maximum, message: "has too many rows (maximum is %{count})")
      end
    end
end
