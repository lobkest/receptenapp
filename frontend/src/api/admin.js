// De beheer-API: alleen nog verwijderverzoeken en versies. Elke functie krijgt de
// beheercode mee en stuurt die uitsluitend in de Authorization-header, nooit in de URL:
// URL's belanden in browsergeschiedenis, serverlogs en Referer-headers.
import { request } from '@/api/client'

const BASE = '/api/admin'

function adminRequest(code, path, options = {}) {
  return request(path, {
    ...options,
    headers: { Authorization: `Bearer ${code}`, ...options.headers },
  })
}

function recipePath(id) {
  return `${BASE}/recipes/${encodeURIComponent(id)}`
}

// [{ id, title, deletion_requested_at, deletion_reason, type: 'recipe' }], nieuwste eerst.
export function fetchDeletionRequests(code) {
  return adminRequest(code, `${BASE}/deletion_requests`)
}

// Alleen voor een recept met een verwijderverzoek.
export function deleteRecipe(code, id) {
  return adminRequest(code, recipePath(id), { method: 'DELETE' })
}

// Verwijderverzoek afwijzen: het recept is weer zichtbaar.
export function restoreRecipe(code, id) {
  return adminRequest(code, `${recipePath(id)}/restore`, { method: 'PATCH' })
}

// { recipe: { id, title, deletion_requested_at }, versions: [{ id, created_at, summary, current }] }
export function fetchRecipeVersions(code, id) {
  return adminRequest(code, `${recipePath(id)}/versions`)
}

export function restoreRecipeVersion(code, id, versionId) {
  return adminRequest(code, `${recipePath(id)}/versions/${encodeURIComponent(versionId)}/restore`, {
    method: 'POST',
  })
}
