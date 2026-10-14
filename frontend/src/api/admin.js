// De beheer-API. Elke functie krijgt de beheercode mee en stuurt die
// uitsluitend in de Authorization-header, nooit in de URL: URL's belanden
// in browsergeschiedenis, serverlogs en Referer-headers.
import { request } from '@/api/client'

const BASE = '/api/admin/recipes'

function adminRequest(code, path, options = {}) {
  return request(path, {
    ...options,
    headers: { Authorization: `Bearer ${code}`, ...options.headers },
  })
}

function recipePath(id) {
  return `${BASE}/${encodeURIComponent(id)}`
}

// status: 'pending' | 'approved' | 'rejected', of leeg voor alle recepten.
export function fetchAdminRecipes(code, status) {
  const query = status ? `?status=${encodeURIComponent(status)}` : ''
  return adminRequest(code, `${BASE}${query}`)
}

export function fetchAdminRecipe(code, id) {
  return adminRequest(code, recipePath(id))
}

export function updateAdminRecipe(code, id, recipe) {
  return adminRequest(code, recipePath(id), {
    method: 'PATCH',
    body: JSON.stringify({ recipe }),
  })
}

export function approveRecipe(code, id) {
  return adminRequest(code, `${recipePath(id)}/approve`, { method: 'PATCH' })
}

export function rejectRecipe(code, id) {
  return adminRequest(code, `${recipePath(id)}/reject`, { method: 'PATCH' })
}

export function deleteRecipe(code, id) {
  return adminRequest(code, recipePath(id), { method: 'DELETE' })
}

// Standaardboodschappen: ook achter de beheercode.
const STANDARD_BASE = '/api/admin/standard_items'

function standardItemPath(id) {
  return `${STANDARD_BASE}/${encodeURIComponent(id)}`
}

export function fetchStandardItems(code) {
  return adminRequest(code, STANDARD_BASE)
}

// item: { name, category }; category null = geen categorie ("overig").
export function createStandardItem(code, item) {
  return adminRequest(code, STANDARD_BASE, {
    method: 'POST',
    body: JSON.stringify({ standard_item: item }),
  })
}

export function updateStandardItem(code, id, item) {
  return adminRequest(code, standardItemPath(id), {
    method: 'PATCH',
    body: JSON.stringify({ standard_item: item }),
  })
}

export function deleteStandardItem(code, id) {
  return adminRequest(code, standardItemPath(id), { method: 'DELETE' })
}

// Alles of niets, in één transactie. Geeft { deleted_ids } terug.
export function bulkDeleteStandardItems(code, ids) {
  return adminRequest(code, `${STANDARD_BASE}/bulk_destroy`, {
    method: 'POST',
    body: JSON.stringify({ ids }),
  })
}
