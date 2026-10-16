# Works out the automatic tags (Tag.automatic: vegetarisch, veganistisch, glutenvrij,
# lactosevrij) of a recipe or a variation from the traits of its ingredients.
#
#   evaluator = RecipeTagEvaluator.load
#   evaluator.for_recipe(recipe)   # => [ Result(tag: vegetarisch, status: "met_wissel", ...), ... ]
#
# An option (the ingredient of a row, or one of its alternatives) is ok for a tag when it
# has none of the traits the tag excludes. A row is fine when it is optional, its own
# ingredient is ok, or at least one alternative is. Per tag:
# - "ja": every row is fine as it stands; optional rows that are not ok are left out
#   (without: "zonder koriander");
# - "met_wissel": every row is fine, but some only through an alternative (swaps: "met
#   tofu i.p.v. kip", with all alternatives that are ok);
# - "nee": a row that is not optional and has no ok option.
#
# An ingredient without traits counts as ok: the traits say what it is, and the
# ingredients page shows which ones nobody has checked yet (traits_checked). A recipe
# without ingredients (an older one) says nothing, so it gets "nee" for every tag.
#
# One evaluator per request: it loads the automatic tags once, and remembers each
# recipe's result, so the recipe list can filter and serialize without working it out
# twice. Load the recipes with PRELOAD (or Recipe.with_details) to avoid one query per row.
class RecipeTagEvaluator
  # Our own data, not a label: these tags get "controleer etiketten" on the recipe page.
  DISCLAIMER_TRAITS = %w[ gluten lactose ].freeze

  PRELOAD = { recipe_ingredients: [ { ingredient: :ingredient_traits }, { alternatives: { ingredient: :ingredient_traits } } ] }.freeze

  # id: the alternative's id, nil for the row's own ingredient.
  Option = Data.define(:id, :name, :trait_ids)
  # id: the recipe_ingredient_id, nil for an ingredient a variation adds.
  Line = Data.define(:id, :optional, :original, :alternatives)
  # A row that needs one of these alternatives.
  Swap = Data.define(:recipe_ingredient_id, :ingredient, :alternatives)
  # An optional row that is left out; alternative_ids are the ok ones, if any.
  Skip = Data.define(:recipe_ingredient_id, :ingredient, :alternative_ids)
  # blockers: for "nee", the names of the rows that make it fail.
  # name: the tag's name.
  Result = Data.define(:name, :status, :swaps, :without, :disclaimer, :blockers) do
    # Passes the tag filter: "ja" or "met_wissel".
    def passes?
      status != "nee"
    end
  end

  # One query: { "vegetarisch" => [ "vlees", "vis" ] } with the trait ids.
  def self.load
    rows = TagExclusion.joins(:tag, :trait).order("tags.name", "traits.id").pluck("tags.name", "traits.id", "traits.name")
    new(rows.group_by(&:first).transform_values { |list| list.to_h { |_, id, name| [ id, name ] } })
  end

  # { name => Ingredient } for what the variations add, with their traits. Additions refer
  # to an ingredient by name (VariationChange#name).
  def self.addition_ingredients(variations)
    Ingredient.includes(:ingredient_traits).where(name: variations.flat_map { |variation| variation.additions.map(&:name) }).index_by(&:name)
  end

  # exclusions: { tag name => { trait id => trait name } }.
  def initialize(exclusions)
    @tags = exclusions.map do |name, traits|
      [ name, traits.keys.to_set, traits.values.intersect?(DISCLAIMER_TRAITS) ]
    end
    @recipes = {}
  end

  def names
    @tags.map(&:first)
  end

  def automatic?(name)
    names.include?(name)
  end

  def for_recipe(recipe)
    return evaluate(recipe.recipe_ingredients.map { |row| line(row) }) if recipe.id.nil?

    @recipes[recipe.id] ||= evaluate(recipe.recipe_ingredients.map { |row| line(row) })
  end

  # The base recipe without the rows the variation leaves out, plus what it adds (never
  # optional, no alternatives). The alternatives of the base rows still count: the recipe
  # page can swap them in a variation too. ingredients: see addition_ingredients.
  def for_variation(variation, recipe: variation.recipe, ingredients: nil)
    ingredients ||= self.class.addition_ingredients([ variation ])
    removed = variation.removed_ingredient_ids
    lines = recipe.recipe_ingredients.reject { |row| removed.include?(row.id) }.map { |row| line(row) }
    lines += variation.additions.map do |addition|
      Line.new(id: nil, optional: false, original: option(nil, addition.name, ingredients[addition.name]), alternatives: [])
    end
    evaluate(lines)
  end

  # The names of the automatic tags that pass, for the tag filter.
  def passing_names(recipe)
    for_recipe(recipe).select(&:passes?).map(&:name)
  end

  # The automatic tags a variation adds ("+ veganistisch") or takes off ("− vegetarisch"),
  # compared with the base recipe: [ [ "add" or "remove", tag name ] ].
  def variation_changes(variation, recipe: variation.recipe, ingredients: nil)
    base = for_recipe(recipe).to_h { |result| [ result.name, result.passes? ] }
    for_variation(variation, recipe: recipe, ingredients: ingredients).filter_map do |result|
      next if result.passes? == base[result.name]

      [ result.passes? ? "add" : "remove", result.name ]
    end
  end

  private
    def evaluate(lines)
      @tags.map { |tag, excluded, disclaimer| result(tag, excluded, disclaimer, lines) }
    end

    def result(tag, excluded, disclaimer, lines)
      return Result.new(name: tag, status: "nee", swaps: [], without: [], disclaimer: disclaimer, blockers: []) if lines.empty?

      ok = ->(option) { option.trait_ids.none? { |id| excluded.include?(id) } }
      swaps = []
      without = []
      blockers = []

      lines.each do |line|
        next if ok.(line.original)

        good = line.alternatives.select(&ok)
        if line.optional
          without << Skip.new(recipe_ingredient_id: line.id, ingredient: line.original.name, alternative_ids: good.map(&:id))
        elsif good.any?
          swaps << Swap.new(recipe_ingredient_id: line.id, ingredient: line.original.name, alternatives: good)
        else
          blockers << line.original.name
        end
      end

      if blockers.any?
        Result.new(name: tag, status: "nee", swaps: [], without: [], disclaimer: disclaimer, blockers: blockers)
      else
        Result.new(name: tag, status: swaps.any? ? "met_wissel" : "ja", swaps: swaps, without: without, disclaimer: disclaimer, blockers: [])
      end
    end

    def line(row)
      Line.new(id: row.id, optional: row.optional, original: option(nil, row.ingredient_name, row.ingredient),
        alternatives: row.alternatives.map { |alternative| option(alternative.id, alternative.ingredient_name, alternative.ingredient) })
    end

    # An ingredient that is not saved (yet) has no traits.
    def option(id, name, ingredient)
      Option.new(id: id, name: name, trait_ids: ingredient&.persisted? ? ingredient.trait_ids_loaded : [])
    end
end
