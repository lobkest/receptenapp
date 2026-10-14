# A full copy of a recipe after a change: title, description, servings, tags, ingredients
# and steps, as one JSON document (snapshot). Recipe#restore_version! puts it back.
#
# Why not paper_trail: it versions one table at a time. Bringing back a recipe together
# with its ingredients, steps and tags needs the separate paper_trail-association_tracking
# gem, which PaperTrail itself split off as experimental. One snapshot per change is simpler.
class RecipeVersion < ApplicationRecord
  MAX_PER_RECIPE = 50

  # The parts of a snapshot, with the Dutch word used in the summary.
  PARTS = {
    "title" => "titel",
    "description" => "beschrijving",
    "servings" => "porties",
    "tag_names" => "tags",
    "ingredients" => "ingrediënten",
    "steps" => "stappen"
  }.freeze

  belongs_to :recipe

  scope :newest_first, -> { order(id: :desc) }

  # The recipe as stored in the database right now, so ingredients and steps that were
  # just removed are really gone. Quantities as text ("1.5"), so nothing is rounded.
  def self.snapshot_of(recipe)
    recipe = Recipe.with_details.find(recipe.id)
    {
      "title" => recipe.title,
      "description" => recipe.description,
      "servings" => recipe.servings,
      "tag_names" => recipe.tags.map(&:name).sort,
      "ingredients" => recipe.recipe_ingredients.map { |row|
        { "ingredient_name" => row.ingredient_name, "quantity" => row.quantity&.to_s("F"),
          "unit" => row.unit, "optional" => row.optional }
      },
      "steps" => recipe.steps.map { |step| { "body" => step.body } }
    }
  end

  # Stores and returns a new version, or nil if nothing changed since the last one (for
  # example when only a deletion was requested). Keeps at most MAX_PER_RECIPE per recipe.
  # note replaces the summary, e.g. "Teruggezet naar de versie van ...".
  def self.record!(recipe, note: nil)
    snapshot = snapshot_of(recipe)
    previous = where(recipe: recipe).newest_first.first&.snapshot
    return if snapshot == previous

    version = create!(recipe: recipe, snapshot: snapshot, summary: note || summarize(previous, snapshot))
    prune(recipe)
    version
  end

  # "Eerste versie" or "Gewijzigd: titel en ingrediënten".
  def self.summarize(previous, current)
    return "Eerste versie" unless previous

    changed = PARTS.select { |key, _| previous[key] != current[key] }.values
    "Gewijzigd: #{changed.to_sentence}"
  end

  def self.prune(recipe)
    kept = where(recipe: recipe).newest_first.limit(MAX_PER_RECIPE).select(:id)
    where(recipe: recipe).where.not(id: kept).delete_all
  end
  private_class_method :prune

  # "14 oktober 2026 20:15", Dutch time.
  def label
    I18n.l(created_at.in_time_zone("Europe/Amsterdam"), format: "%-d %B %Y %H:%M")
  end
end
