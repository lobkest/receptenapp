// Zoeken en filteren zonder server, op de recepten uit de offline snapshot. Online doet de
// server dit; hier staat dezelfde logica in JavaScript, zodat het offline hetzelfde werkt:
// - tags:             Recipe.with_all_tags (handmatige én automatische tags die passen)
// - "Met ingrediënt…": app/models/ingredient_search.rb
// - "In huis":        app/models/pantry_matcher.rb
// De recepten zijn hier die van /api/recipes/:id (met ingredients en automatic_tags).

// Zoveel mag er ontbreken op "In huis" (PantryMatcher::MAX_MISSING).
export const MAX_MISSING = 2
const VIAS = ['original', 'alternative', 'optional']

function tagNames(recipe) {
  return [...recipe.tags, ...(recipe.automatic_tags ?? []).map((tag) => tag.name)]
}

// Alleen recepten met al deze tags.
export function withAllTags(recipes, tags) {
  return recipes.filter((recipe) => tags.every((tag) => tagNames(recipe).includes(tag)))
}

const byTitle = (a, b) =>
  a.title.toLowerCase() < b.title.toLowerCase()
    ? -1
    : a.title.toLowerCase() > b.title.toLowerCase()
      ? 1
      : a.id - b.id

// Wat de regel dekt uit deze ingrediënt-ids: de regel zelf, het eerste alternatief, of null
// (PantryMatcher.covering).
function covering(row, ids) {
  if (ids.has(row.ingredient_id)) return row
  return (row.alternatives ?? []).find((alternative) => ids.has(alternative.ingredient_id)) ?? null
}

// De regels die nog ontbreken (niet optioneel, niet gedekt): [{ id, name }].
function missingRows(recipe, presentIds) {
  return recipe.ingredients
    .filter((row) => !row.optional && covering(row, presentIds) == null)
    .map((row) => ({ id: row.id, name: row.name }))
}

// "In huis": drie groepen (0, 1, 2 ontbrekend), zoals /api/pantry/recipes. presentIds: Set.
export function pantryGroups(recipes, presentIds) {
  const results = recipes
    .filter((recipe) => recipe.ingredients.length > 0)
    .map((recipe) => ({ recipe, missing: missingRows(recipe, presentIds) }))
    .filter((result) => result.missing.length <= MAX_MISSING)
    .sort((a, b) => a.missing.length - b.missing.length || byTitle(a.recipe, b.recipe))
  return Array.from({ length: MAX_MISSING + 1 }, (_, count) => ({
    missing_count: count,
    recipes: results
      .filter((result) => result.missing.length === count)
      .map(({ recipe, missing }) => ({
        id: recipe.id,
        title: recipe.title,
        servings: recipe.servings,
        category: recipe.category,
        missing,
      })),
  }))
}

// "Met ingrediënt…": recepten met minstens één van ids, elk met ingredient_match, de beste
// eerst (IngredientSearch). presentIds: Set van wat in huis is.
export function ingredientSearch(recipes, ids, presentIds) {
  const chosen = [...new Set(ids)]
  const available = new Set([...presentIds, ...chosen])
  return recipes
    .map((recipe) => {
      const matches = chosen.map((id) => bestMatch(recipe, id)).filter(Boolean)
      if (matches.length === 0) return null
      return {
        ...recipe,
        ingredient_match: {
          matches: matches.map(({ ingredient_id, name, via, swap }) => ({
            ingredient_id,
            name,
            via,
            swap,
          })),
          missing: missingRows(recipe, available),
          missing_count: missingRows(recipe, available).length,
        },
      }
    })
    .filter(Boolean)
    .sort((a, b) => compareKeys(sortKey(a), sortKey(b)))
}

function bestMatch(recipe, id) {
  const matches = recipe.ingredients
    .map((row) => {
      const cover = covering(row, new Set([id]))
      if (cover == null) return null
      const alternative = cover === row ? null : cover
      const via = row.optional ? 'optional' : alternative ? 'alternative' : 'original'
      return {
        ingredient_id: id,
        name: (alternative ?? row).name,
        via,
        swap: alternative && {
          recipe_ingredient_id: row.id,
          alternative_id: alternative.id,
          ingredient: row.name,
          alternative: alternative.name,
        },
      }
    })
    .filter(Boolean)
  return matches.sort((a, b) => VIAS.indexOf(a.via) - VIAS.indexOf(b.via))[0] ?? null
}

function sortKey(recipe) {
  const vias = recipe.ingredient_match.matches.map((match) => match.via)
  const count = (via) => vias.filter((v) => v === via).length
  return [
    -vias.length,
    -count('original'),
    -count('alternative'),
    recipe.ingredient_match.missing_count,
    recipe.title.toLowerCase(),
    recipe.id,
  ]
}

function compareKeys(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return -1
    if (a[i] > b[i]) return 1
  }
  return 0
}
