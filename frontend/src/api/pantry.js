// "In huis": één voorraad voor de hele app, openbaar zoals de boodschappenlijst.
import { request } from '@/api/client'

// { in_house: [{ id, name }], staples: [{ id, name, present }], suggestions: [{ id, name }] }
// in_house: wat verder in huis is (geen basis). staples: alle basis, present false = op.
// suggestions: snelkeuze, de ingrediënten die het vaakst in recepten staan.
export function fetchPantry() {
  return request('/api/pantry')
}

// [{ missing_count: 0, recipes }, { missing_count: 1, ... }, { missing_count: 2, ... }].
// Een recept: { id, title, servings, category, missing: [{ id (regel-id), name }] }.
// tags filtert zoals /api/recipes; category: '3' of 'overig'.
export function fetchPantryRecipes({ tags = [], category = null } = {}) {
  const params = new URLSearchParams()
  if (tags.length) params.set('tags', tags.join(','))
  if (category) params.set('category', category)
  const query = params.toString()
  return request(`/api/pantry/recipes${query ? `?${query}` : ''}`)
}

// In huis (true) of eruit / op (false). Geeft de hele voorraad terug, zoals fetchPantry.
export function setInHouse(ingredientId, present) {
  return request(`/api/pantry/ingredients/${encodeURIComponent(ingredientId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ pantry_item: { present } }),
  })
}

// "Terug naar standaard": alleen de basis in huis.
export function resetPantry() {
  return request('/api/pantry/reset', { method: 'POST' })
}
