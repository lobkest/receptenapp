// Ingrediënten en NEVO-online: koppelen voor de voedingswaarde. Openbaar, zoals recepten.
import { request } from '@/api/client'

// [{ id, name, nevo_food: { code, name } | null, label_values, needs_review }], op naam.
export function fetchIngredients() {
  return request('/api/ingredients')
}

// Alles voor het bewerkscherm: NEVO-product met waarden per 100, omrekening, etiketwaarden,
// lock_version en units (hoe recepten het gebruiken: ['stuks', 'ml']).
export function fetchIngredient(id) {
  return request(`/api/ingredients/${encodeURIComponent(id)}`)
}

// fields: { lock_version, nevo_food_id, grams_per_piece, grams_per_ml, label_kcal, ... }.
// Opslaan haalt "te controleren" eraf; "Klopt" stuurt alleen lock_version. Was iemand
// anders je voor, dan geeft de server 409 (ApiError kind 'conflict').
export function updateIngredient(id, fields) {
  return request(`/api/ingredients/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ ingredient: fields }),
  })
}

// De beste 20 NEVO-producten voor een zoekterm, op naam en synoniem.
export function searchNevoFoods(query) {
  return request(`/api/nevo_foods?q=${encodeURIComponent(query)}`)
}
