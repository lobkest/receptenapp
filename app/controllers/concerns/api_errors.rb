# One shape for every error the API sends, so the frontend reads it in one place
# (frontend/src/api/client.js):
#
#   { "error": "Controleer de ingevulde velden.", "errors": { "title": [ "moet opgegeven zijn" ] } }
#
# error is a Dutch message for the whole request; errors has the messages per field
# (without the field name: the form puts its own label in front), or is {} when no
# single field is to blame. Texts come from config/locales/nl.yml and rails-i18n.
#
# rescue_from turns an exception anywhere in an action into this response, like
# @app.errorhandler in Flask or @ExceptionHandler in Spring. So an action can simply call
# find, save! or params.expect, and does not need its own begin/rescue for each case.
module ApiErrors
  extend ActiveSupport::Concern

  included do
    rescue_from ActiveRecord::RecordNotFound, with: :render_not_found
    rescue_from ActiveRecord::RecordInvalid, with: ->(error) { render_invalid(error.record) }
    rescue_from ActiveRecord::StaleObjectError, with: :render_conflict
    rescue_from ActionController::ParameterMissing, with: :render_parameter_missing
    # More nested rows than accepts_nested_attributes_for allows (Recipe::MAX_NESTED_ROWS).
    rescue_from ActiveRecord::NestedAttributes::TooManyRecords do
      render_error :unprocessable_content, I18n.t("api.invalid"), base: [ I18n.t("errors.messages.too_many_rows") ]
    end
  end

  private
    def render_error(status, message, errors = {})
      render json: { error: message, errors: errors }, status: status
    end

    # record: anything with ActiveModel errors (a model, or a form object like
    # ShoppingListAddition). message: when no form shows the fields, say what is wrong.
    def render_invalid(record, message: I18n.t("api.invalid"))
      render_error :unprocessable_content, message, record.errors
    end

    # "Recept niet gevonden.": the model's Dutch name from nl.yml (activerecord.models).
    def render_not_found(error)
      model = error.model&.safe_constantize
      message = model ? I18n.t("api.not_found", model: model.model_name.human.upcase_first) : I18n.t("api.route_not_found")
      render_error :not_found, message
    end

    # lock_version was outdated: someone else saved in between.
    def render_conflict(error)
      render_error :conflict, I18n.t("api.conflict.#{error.record.model_name.i18n_key}", default: :"api.conflict.default")
    end

    def render_parameter_missing(error)
      render_error :bad_request, I18n.t("api.parameter_missing", param: error.param),
        error.param => [ I18n.t("errors.messages.blank") ]
    end
end
