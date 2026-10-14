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

// item: { name, category }; category null = geen categorie ("overig").
export function createStandardItem(item) {
  return request(BASE, { method: 'POST', body: JSON.stringify({ standard_item: item }) })
}

export function updateStandardItem(id, item) {
  return request(itemPath(id), { method: 'PATCH', body: JSON.stringify({ standard_item: item }) })
}

export function deleteStandardItem(id) {
  return request(itemPath(id), { method: 'DELETE' })
}

// Alles of niets, in één transactie. Geeft { deleted_ids } terug.
export function bulkDeleteStandardItems(ids) {
  return request(`${BASE}/bulk_destroy`, { method: 'POST', body: JSON.stringify({ ids }) })
}
