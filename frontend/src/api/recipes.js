// De openbare API: recepten lezen, toevoegen, bewerken en verwijderen aanvragen.
import { request } from '@/api/client'

// tags: ['vega', 'snel'] geeft alleen recepten met al deze tags: /api/recipes?tags=vega,snel.
// Een tag kan zelf geen komma bevatten (de server weigert dat), dus de komma scheidt veilig.
export function fetchRecipes(tags = []) {
  const query = tags.length ? `?tags=${tags.map(encodeURIComponent).join(',')}` : ''
  return request(`/api/recipes${query}`)
}

// [{ name: 'vega', count: 3 }]: tags van zichtbare recepten, op naam.
export function fetchTags() {
  return request('/api/tags')
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
