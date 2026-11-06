// De standaardlijst: openbaar, zonder beheercode. Iedereen met de link ziet en wijzigt
// dezelfde lijst.
import { request } from '@/api/client'

const BASE = '/api/standard_items'

function itemPath(id) {
  return `${BASE}/${encodeURIComponent(id)}`
}

export function fetchStandardItems() {
  return request(BASE)
}

// item: { name, category, client_id? }; category null = geen categorie ("overig").
// client_id: een uuid; nog een keer met hetzelfde geeft het bestaande item terug.
export function createStandardItem(item) {
  return request(BASE, { method: 'POST', body: JSON.stringify({ standard_item: item }) })
}

export function updateStandardItem(id, item) {
  return request(itemPath(id), { method: 'PATCH', body: JSON.stringify({ standard_item: item }) })
}

export function deleteStandardItem(id) {
  return request(itemPath(id), { method: 'DELETE' })
}

// Elk item één keer op de boodschappenlijst: een nieuwe regel, of één erbij op een regel
// die er al (open) op staat. Geeft de nieuwe en gewijzigde regels terug.
export function addStandardItemsToShoppingList(ids) {
  return request(`${BASE}/add_to_shopping_list`, { method: 'POST', body: JSON.stringify({ ids }) })
}

// Hetzelfde op naam, voor een wijziging uit de outbox: een item dat offline is aangemaakt,
// heeft nog geen id. Met hetzelfde clientActionId telt de server niets dubbel.
export function addStandardNamesToShoppingList(names, clientActionId) {
  return request(`${BASE}/add_to_shopping_list`, {
    method: 'POST',
    body: JSON.stringify({ names, client_action_id: clientActionId }),
  })
}

// Alles of niets, in één transactie. Geeft { deleted_ids } terug.
export function bulkDeleteStandardItems(ids) {
  return request(`${BASE}/bulk_destroy`, { method: 'POST', body: JSON.stringify({ ids }) })
}

// "Mogelijk hetzelfde": items zonder ingrediënt met de ingrediënten die er waarschijnlijk
// hetzelfde zijn ("uien" ↔ "ui"). [{ standard_item, candidates: [{ id, name }] }]
export function fetchLinkSuggestions() {
  return request(`${BASE}/link_suggestions`)
}

// "Ja, hetzelfde": het item is voortaan dat ingrediënt (ook zijn open regels op de
// boodschappenlijst). Geeft het item terug, met ingredient_id.
export function linkStandardItem(id, ingredientId) {
  return request(`${itemPath(id)}/link`, {
    method: 'POST',
    body: JSON.stringify({ ingredient_id: ingredientId }),
  })
}

export function unlinkStandardItem(id) {
  return request(`${itemPath(id)}/unlink`, { method: 'POST' })
}

// "Nee": dit paar komt niet meer terug in de suggesties.
export function rejectStandardItemLink(id, ingredientId) {
  return request(`${itemPath(id)}/reject_link`, {
    method: 'POST',
    body: JSON.stringify({ ingredient_id: ingredientId }),
  })
}
