// De beheer-API: alleen nog verwijderverzoeken (van recepten en variaties) en versies. Elke functie krijgt de
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

// Recepten en variaties door elkaar, nieuwste eerst:
// [{ id, title, deletion_requested_at, deletion_reason, type: 'recipe' }]
// [{ id, title, …, type: 'variation', recipe_id, recipe_title }] (title is de naam van de variatie)
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

function variationPath(id) {
  return `${BASE}/variations/${encodeURIComponent(id)}`
}

// Alleen voor een variatie met een verwijderverzoek.
export function deleteVariation(code, id) {
  return adminRequest(code, variationPath(id), { method: 'DELETE' })
}

export function restoreVariation(code, id) {
  return adminRequest(code, `${variationPath(id)}/restore`, { method: 'PATCH' })
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
