// Variaties op een recept: openbaar, net als recepten. Toevoegen en bewerken mag
// iedereen (bewerken met lock_version); verwijderen is een verzoek aan de beheerder.
import { request } from '@/api/client'

function variationsPath(recipeId) {
  return `/api/recipes/${encodeURIComponent(recipeId)}/variations`
}

function variationPath(recipeId, id) {
  return `${variationsPath(recipeId)}/${encodeURIComponent(id)}`
}

// variation: wat VariationForm verstuurt: { name, notes, removed_ingredient_ids,
// added_ingredients, added_tag_names, removed_tag_names }.
export function createVariation(recipeId, variation) {
  return request(variationsPath(recipeId), {
    method: 'POST',
    body: JSON.stringify({ variation }),
  })
}

// Met lock_version van de geladen variatie: was iemand anders je voor, dan 409.
export function updateVariation(recipeId, id, variation) {
  return request(variationPath(recipeId, id), {
    method: 'PATCH',
    body: JSON.stringify({ variation }),
  })
}

// Verbergt de variatie meteen; de beheerder beslist of ze definitief weg gaat.
export function requestVariationDeletion(recipeId, id, reason) {
  return request(`${variationPath(recipeId, id)}/request_deletion`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

// Zet de variatie op de boodschappenlijst, geschaald naar servings. De server rekent:
// het basisrecept min de weggelaten en optionele ingrediënten, plus de extra's. Met
// alternativeIds gaan gewisselde ingrediënten als hun alternatief mee. Geeft de nieuwe
// regels terug.
export function addVariationToShoppingList(recipeId, id, servings, alternativeIds = []) {
  const body = alternativeIds.length ? { servings, alternative_ids: alternativeIds } : { servings }
  return request(`${variationPath(recipeId, id)}/add_to_shopping_list`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}
