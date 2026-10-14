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

export function clearCheckedShoppingListItems() {
  return request(`${BASE}/clear_checked`, { method: 'DELETE' })
}

export function clearAllShoppingListItems() {
  return request(`${BASE}/clear_all`, { method: 'DELETE' })
}
