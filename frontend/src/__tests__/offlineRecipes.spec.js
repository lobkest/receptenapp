import { describe, it, expect } from 'vitest'
import { ingredientSearch, pantryGroups, withAllTags } from '../utils/offlineRecipes'

// Zoeken en filteren offline, in de browser: dezelfde regels als de server
// (Recipe.with_all_tags, IngredientSearch, PantryMatcher).
const row = (id, ingredientId, name, fields = {}) => ({
  id,
  ingredient_id: ingredientId,
  name,
  optional: false,
  alternatives: [],
  ...fields,
})

const WOK = {
  id: 1,
  title: 'Wok',
  servings: 2,
  category: null,
  tags: ['snel'],
  automatic_tags: [{ name: 'vegetarisch' }],
  ingredients: [
    row(11, 100, 'kip', { alternatives: [{ id: 5, ingredient_id: 101, name: 'tofu' }] }),
    row(12, 102, 'paprika'),
    row(13, 103, 'koriander', { optional: true }),
  ],
}
const SOEP = {
  id: 2,
  title: 'Soep',
  servings: 4,
  category: null,
  tags: [],
  automatic_tags: [],
  ingredients: [row(21, 102, 'paprika'), row(22, 104, 'ui'), row(23, 105, 'bouillon')],
}
const OUD = { id: 3, title: 'Oud', servings: 4, tags: [], automatic_tags: [], ingredients: [] }

describe('offline zoeken en filteren', () => {
  it('tags: handmatige en automatische tellen allebei, alle gekozen moeten erop', () => {
    expect(withAllTags([WOK, SOEP], ['vegetarisch', 'snel']).map((r) => r.id)).toEqual([1])
    expect(withAllTags([WOK, SOEP], []).map((r) => r.id)).toEqual([1, 2])
  })

  it('In huis: een alternatief dekt de regel, optioneel telt niet, zonder ingrediënten valt weg', () => {
    const groups = pantryGroups([WOK, SOEP, OUD], new Set([101, 102]))

    expect(groups.map((g) => [g.missing_count, g.recipes.map((r) => r.title)])).toEqual([
      [0, ['Wok']],
      [1, []],
      [2, ['Soep']],
    ])
    expect(groups[2].recipes[0].missing).toEqual([
      { id: 22, name: 'ui' },
      { id: 23, name: 'bouillon' },
    ])
  })

  it('met ingrediënt: origineel voor alternatief, met de wissel, en wat er nog ontbreekt', () => {
    const results = ingredientSearch([SOEP, WOK], [102, 101], new Set())

    expect(results.map((r) => r.title)).toEqual(['Wok', 'Soep'])
    expect(results[0].ingredient_match.matches).toEqual([
      { ingredient_id: 102, name: 'paprika', via: 'original', swap: null },
      {
        ingredient_id: 101,
        name: 'tofu',
        via: 'alternative',
        swap: {
          recipe_ingredient_id: 11,
          alternative_id: 5,
          ingredient: 'kip',
          alternative: 'tofu',
        },
      },
    ])
    expect(results[0].ingredient_match.missing).toEqual([])
    expect(results[1].ingredient_match.missing_count).toBe(2)
  })
})
