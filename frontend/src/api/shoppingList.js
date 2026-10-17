// De boodschappenlijst: één gedeelde lijst op de server, openbaar en zonder beheercode.
import { request } from '@/api/client'

const BASE = '/api/shopping_list_items'

function itemPath(id) {
  return `${BASE}/${encodeURIComponent(id)}`
}

export function fetchShoppingList() {
  return request(BASE)
}

// items: [{ name, quantity, unit, source_label, recipe_id, checked? }]. Elk item wordt een
// nieuwe regel, ook als dezelfde naam er al staat. Geeft de nieuwe regels terug, in de
// volgorde van items. Alles of niets.
export function addShoppingListItems(items) {
  return request(BASE, { method: 'POST', body: JSON.stringify({ shopping_list_items: items }) })
}

// fields: { checked } of { name }.
export function updateShoppingListItem(id, fields) {
  return request(itemPath(id), {
    method: 'PATCH',
    body: JSON.stringify({ shopping_list_item: fields }),
  })
}

export function deleteShoppingListItem(id) {
  return request(itemPath(id), { method: 'DELETE' })
}

// De −-knop: één minder van de standaardlijst. Geeft { item } terug; item is null als de
// regel daardoor weg is.
export function removeStandardFromShoppingListItem(id) {
  return request(`${itemPath(id)}/remove_standard`, { method: 'POST' })
}

// "✓ op lijst" op een recept: het receptdeel eraf; wat van de standaardlijst kwam, blijft.
// Geeft { item } terug; item is null als de regel weg is.
export function removeRecipeFromShoppingListItem(id) {
  return request(`${itemPath(id)}/remove_recipe`, { method: 'POST' })
}

// "Verwijder" in "Recepten op je lijst": alle open regels van één recept, in één request.
// recipeId, of voor een verwijderd recept sourceLabel. Regels die ook van de standaardlijst
// kwamen, blijven als standaardregel. Geeft { removed_ids, items } terug (items: die bleven).
export function removeRecipeFromShoppingList({ recipeId = null, sourceLabel = null }) {
  const query =
    recipeId != null
      ? `recipe_id=${encodeURIComponent(recipeId)}`
      : `source_label=${encodeURIComponent(sourceLabel)}`
  return request(`${BASE}?${query}`, { method: 'DELETE' })
}

export function clearCheckedShoppingListItems() {
  return request(`${BASE}/clear_checked`, { method: 'DELETE' })
}

export function clearAllShoppingListItems() {
  return request(`${BASE}/clear_all`, { method: 'DELETE' })
}
