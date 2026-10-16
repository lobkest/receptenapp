class Api::TagsController < ApplicationController
  # GET /api/tags
  # Only tags of visible recipes, with how many visible recipes have them. Tags of recipes
  # whose deletion was requested, and tags no recipe uses any more, do not show up.
  # automatic: worked out from the ingredients (RecipeTagEvaluator), counted per recipe
  # that passes ("ja" or "met_wissel"), and not something a form can pick.
  def index
    evaluator = RecipeTagEvaluator.load
    counts = Tag.manual.joins(:recipes).merge(Recipe.visible).group(:name).count
      .map { |name, count| { name: name, count: count, automatic: false } }

    render json: (counts + automatic_counts(evaluator)).sort_by { |tag| tag[:name] }
  end

  private
    def automatic_counts(evaluator)
      counts = Hash.new(0)
      Recipe.visible.includes(RecipeTagEvaluator::PRELOAD).find_each do |recipe|
        evaluator.passing_names(recipe).each { |name| counts[name] += 1 }
      end
      counts.map { |name, count| { name: name, count: count, automatic: true } }
    end
end
