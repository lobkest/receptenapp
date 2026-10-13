// De openbare API: alleen goedgekeurde recepten lezen en nieuwe insturen.
import { request } from '@/api/client'

// Zodat bestaande imports van ApiError uit dit bestand blijven werken.
export { ApiError } from '@/api/client'

export function fetchRecipes() {
  return request('/api/recipes')
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
