class ApplicationController < ActionController::API
  # More nested rows than accepts_nested_attributes_for allows (Recipe::MAX_NESTED_ROWS).
  rescue_from ActiveRecord::NestedAttributes::TooManyRecords do
    render json: { errors: { base: [ "has too many rows" ] } }, status: :unprocessable_content
  end
end
