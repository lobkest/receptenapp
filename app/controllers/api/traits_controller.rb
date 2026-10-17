class Api::TraitsController < ApplicationController
  # GET /api/traits  [ { "name": "vlees", "excluded_by": [ "vegetarisch" ] }, ... ]
  # The checkboxes on the ingredient page, in order. excluded_by: the automatic tags this
  # trait rules out, so the page can say what a choice means ("→ niet vegetarisch").
  def index
    traits = Trait.ordered.includes(tag_exclusions: :tag)

    render json: traits.map { |trait| { name: trait.name, excluded_by: trait.tag_exclusions.map { |exclusion| exclusion.tag.name }.sort } }
  end
end
