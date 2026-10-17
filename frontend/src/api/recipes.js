// De openbare API: recepten lezen, toevoegen, bewerken en verwijderen aanvragen.
import { request } from '@/api/client'

// tags: ['vega', 'snel'] geeft alleen recepten met al deze tags: /api/recipes?tags=vega,snel.
// Een tag kan zelf geen komma bevatten (de server weigert dat), dus de komma scheidt veilig.
// ingredientIds: [12, 34] geeft recepten met minstens één van deze ingrediënten, de beste
// eerst, elk met ingredient_match: { matches: [{ ingredient_id, name, via, swap }],
// missing: [{ id (regel-id), name }], missing_count }. via: 'original', 'alternative' of
// 'optional'; swap: { recipe_ingredient_id, alternative_id, ingredient, alternative } of null.
export function fetchRecipes(tags = [], ingredientIds = []) {
  const params = []
  if (tags.length) params.push(`tags=${tags.map(encodeURIComponent).join(',')}`)
  if (ingredientIds.length) params.push(`ingredient_ids=${ingredientIds.join(',')}`)
  return request(`/api/recipes${params.length ? `?${params.join('&')}` : ''}`)
}

// [{ name: 'vega', count: 3 }]: tags van zichtbare recepten, op naam.
export function fetchTags() {
  return request('/api/tags')
}

// [{ id: 1, name: 'Ontbijt', position: 1 }]: alle categorieën, op volgorde (position).
export function fetchCategories() {
  return request('/api/categories')
}

export function fetchRecipe(id) {
  return request(`/api/recipes/${encodeURIComponent(id)}`)
}

export function createRecipe(recipe) {
  // Rails verwacht de velden genest onder "recipe" (params.expect(recipe: [...])).
  return request('/api/recipes', {
    method: 'POST',
    body: JSON.stringify({ recipe }),
  })
}

// recipe: wat RecipeForm verstuurt, plus lock_version van het geladen recept. Was iemand
// anders je voor, dan geeft de server 409 (ApiError kind 'conflict').
export function updateRecipe(id, recipe) {
  return request(`/api/recipes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ recipe }),
  })
}

// Verbergt het recept meteen; de beheerder beslist of het definitief weg gaat.
export function requestDeletion(id, reason) {
  return request(`/api/recipes/${encodeURIComponent(id)}/request_deletion`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

// "Alles op lijst" of "+ lijst": alleen wat en voor hoeveel porties; de server rekent de
// hoeveelheden uit en zet de regels op de boodschappenlijst. ingredientIds null: alles
// behalve de optionele ingrediënten. alternativeIds: de gewisselde ingrediënten ("⇄ tofu").
// Geeft de nieuwe regels terug.
// skipIds: regels die in huis zijn; "Alles op lijst" slaat die over.
export function addRecipeToShoppingList(
  id,
  servings,
  ingredientIds = null,
  alternativeIds = [],
  skipIds = [],
) {
  const body = ingredientIds ? { servings, ingredient_ids: ingredientIds } : { servings }
  if (alternativeIds.length) body.alternative_ids = alternativeIds
  if (skipIds.length) body.skip_ingredient_ids = skipIds
  return request(`/api/recipes/${encodeURIComponent(id)}/add_to_shopping_list`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}
