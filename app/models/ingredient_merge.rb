# Merges one ingredient into another ("trostomaten" into "trostomaat"), in one transaction:
# every reference to the source moves to the target, and then the source is deleted.
#
#   result = IngredientMerge.new(source, target).call
#   result.skipped_recipes  # => [ "Pasta" ]  (recipes that contain both; see below)
#
# What refers to an ingredient:
# - by id: recipe_ingredients and recipe_ingredient_alternatives;
# - by name: added ingredients of variations, shopping list lines and standard list items;
# - by id as well: shopping list lines (ingredient_id) and the stock ("In huis", PantryItem).
#   The stock of the target wins: a row of the source only moves when the target has none.
#
# A recipe that contains both (as rows, or one as an alternative of the other) cannot simply
# be moved: a recipe has each ingredient only once. Such a recipe is left alone and named in
# skipped_recipes, and the source then stays (it is still used there); fix the recipe by hand
# and merge again.
#
# Nutrition: the target keeps its own values; what it lacks (NEVO link, a conversion, a
# label value) is taken from the source.
#
# Traits (vlees, gluten, ...): a target whose traits were checked keeps them as they are.
# Otherwise it gets the traits of both, so a merge never makes a recipe look vegetarian
# that was not. They stay unchecked.
#
# Recipes that change get a new version, and their lock_version goes up, so an edit form
# that was open with the old name gets a 409 instead of bringing the old name back.
class IngredientMerge
  class Invalid < StandardError; end

  Result = Data.define(:target, :source_deleted, :moved_recipes, :skipped_recipes, :copied)

  COPIED_COLUMNS = %i[ grams_per_piece grams_per_ml ] + Ingredient::LABEL_COLUMNS.values

  def initialize(source, target)
    @source = source
    @target = target
  end

  def call
    raise Invalid, "een ingrediënt kan niet met zichzelf worden samengevoegd" if @source.id == @target.id

    Ingredient.transaction do
      @source.lock!
      @target.lock!
      skipped = conflicting_recipe_ids
      moved = recipe_ids_using_source - skipped

      record_original_versions(moved)
      move_rows(skipped)
      rename_by_name(skipped)
      move_shopping_list_and_pantry
      copied = copy_nutrition + copy_traits
      touch_recipes(moved)

      deleted = skipped.empty? && !used_by_id?
      @source.destroy! if deleted
      Result.new(target: @target, source_deleted: deleted, moved_recipes: titles(moved),
        skipped_recipes: titles(skipped), copied: copied)
    end
  end

  private
    def rows_of(ingredient)
      RecipeIngredient.where(ingredient_id: ingredient.id)
    end

    def alternatives_of(ingredient)
      RecipeIngredientAlternative.where(ingredient_id: ingredient.id)
    end

    def recipe_ids_using_source
      (rows_of(@source).pluck(:recipe_id) +
        alternatives_of(@source).joins(:recipe_ingredient).pluck("recipe_ingredients.recipe_id")).uniq
    end

    # Recipes in which source and target would meet: both as rows, the source as an
    # alternative of a target row (or the other way round), or both as alternatives of one row.
    def conflicting_recipe_ids
      source_rows = rows_of(@source).pluck(:id, :recipe_id)
      target_rows = rows_of(@target).pluck(:id, :recipe_id)
      source_alts = alternatives_of(@source).joins(:recipe_ingredient).pluck(:recipe_ingredient_id, "recipe_ingredients.recipe_id")
      target_alts = alternatives_of(@target).joins(:recipe_ingredient).pluck(:recipe_ingredient_id, "recipe_ingredients.recipe_id")

      both_rows = source_rows.map(&:last) & target_rows.map(&:last)
      alt_of_row = (source_alts.map(&:first) & target_rows.map(&:first)) + (target_alts.map(&:first) & source_rows.map(&:first))
      alts_of_one_row = source_alts.map(&:first) & target_alts.map(&:first)
      rows_with_conflict = alt_of_row + alts_of_one_row

      (both_rows + RecipeIngredient.where(id: rows_with_conflict).pluck(:recipe_id)).uniq
    end

    def move_rows(skipped)
      rows_of(@source).where.not(recipe_id: skipped).update_all(ingredient_id: @target.id, updated_at: Time.current)
      alternatives_of(@source).where.not(recipe_ingredient_id: RecipeIngredient.where(recipe_id: skipped).select(:id))
        .update_all(ingredient_id: @target.id, updated_at: Time.current)
    end

    # Names only change where the source is gone; in a skipped recipe its variations keep it.
    def rename_by_name(skipped)
      VariationChange.kind_add.where(name: @source.name)
        .where.not(recipe_variation_id: RecipeVariation.where(recipe_id: skipped).select(:id))
        .update_all(name: @target.name, updated_at: Time.current)
      ShoppingListItem.where(name: @source.name).update_all(name: @target.name, updated_at: Time.current)

      # The standard list has each name once: a double just goes.
      if StandardItem.exists?(name: @target.name)
        StandardItem.where(name: @source.name).delete_all
      else
        StandardItem.where(name: @source.name).update_all(name: @target.name, updated_at: Time.current)
      end
    end

    # Before the source can be deleted: its pantry row would go with it (on_delete: :cascade).
    # A moved row that says what the target's default says is not needed (see PantryItem).
    def move_shopping_list_and_pantry
      ShoppingListItem.where(ingredient_id: @source.id).update_all(ingredient_id: @target.id, updated_at: Time.current)

      row = PantryItem.find_by(ingredient_id: @source.id)
      return if row.nil?

      if PantryItem.exists?(ingredient_id: @target.id) || row.present == @target.staple
        row.delete
      else
        row.update_columns(ingredient_id: @target.id, updated_at: Time.current)
      end
    end

    # What the target lacks, from the source. Returns the names of what was taken over.
    def copy_nutrition
      copied = []
      if @target.nevo_food_id.nil? && @source.nevo_food_id
        @target.nevo_food_id = @source.nevo_food_id
        @target.needs_review ||= @source.needs_review
        copied << "nevo_food"
      end
      COPIED_COLUMNS.each do |column|
        next unless @target.public_send(column).nil? && !@source.public_send(column).nil?

        @target.public_send(:"#{column}=", @source.public_send(column))
        copied << column.to_s
      end
      @target.save! if copied.any?
      copied
    end

    def copy_traits
      return [] if @target.traits_checked

      missing = @source.trait_ids - @target.trait_ids
      return [] if missing.empty?

      @target.trait_ids = @target.trait_ids + missing
      [ "traits" ]
    end

    def record_original_versions(recipe_ids)
      Recipe.where(id: recipe_ids).where.not(id: RecipeVersion.select(:recipe_id)).find_each do |recipe|
        RecipeVersion.record!(recipe, note: "Oorspronkelijke versie")
      end
    end

    def touch_recipes(recipe_ids)
      Recipe.where(id: recipe_ids).update_all([ "lock_version = lock_version + 1, updated_at = ?", Time.current ])
      Recipe.where(id: recipe_ids).find_each do |recipe|
        RecipeVersion.record!(recipe, note: "Ingrediënt samengevoegd: #{@source.name} → #{@target.name}")
      end
    end

    def used_by_id?
      rows_of(@source).exists? || alternatives_of(@source).exists?
    end

    def titles(recipe_ids)
      Recipe.where(id: recipe_ids).order(:title).pluck(:title)
    end
end
