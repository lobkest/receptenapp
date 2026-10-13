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
