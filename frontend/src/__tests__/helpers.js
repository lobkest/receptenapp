import { vi } from 'vitest'

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Vervangt fetch door een nep-server: handler(method, url, options) geeft per
// request een Response terug. Elke aanroep krijgt een nieuwe Response, want een
// body kan maar één keer gelezen worden.
export function mockFetch(handler) {
  const fake = vi.fn(async (url, options = {}) => handler(options.method ?? 'GET', url, options))
  vi.stubGlobal('fetch', fake)
  return fake
}

export function authHeaderOf(call) {
  return call[1].headers.Authorization
}

export const ADMIN_CODE = 'geheim'
const STANDARD_BASE = '/api/admin/standard_items'

// Een nep-server voor de standaardlijst, die zich gedraagt als de Rails-controller:
// beheercode verplicht, namen genormaliseerd en uniek, bulk_destroy alles of niets.
// db is de "database": tests kunnen erin kijken.
export function fakeStandardServer(initial = []) {
  const db = initial.map((item) => ({ category: null, ...item }))
  let nextId = Math.max(0, ...db.map((item) => item.id)) + 1
  const normalize = (value) =>
    String(value ?? '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase()

  function save(item, fields) {
    const name = normalize(fields.name)
    if (!name) return jsonResponse({ errors: { name: ['moet opgegeven zijn'] } }, 422)
    if (db.some((other) => other !== item && other.name === name)) {
      return jsonResponse({ errors: { name: ['is al in gebruik'] } }, 422)
    }
    Object.assign(item, { name, category: normalize(fields.category) || null })
    return null
  }

  const fetch = mockFetch((method, url, options) => {
    if (options.headers?.Authorization !== `Bearer ${ADMIN_CODE}`) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }
    const body = options.body ? JSON.parse(options.body) : {}

    if (url === STANDARD_BASE && method === 'GET') {
      return jsonResponse(db.toSorted((a, b) => a.name.localeCompare(b.name)))
    }
    if (url === STANDARD_BASE && method === 'POST') {
      const item = { id: nextId }
      const error = save(item, body.standard_item)
      if (error) return error
      nextId++
      db.push(item)
      return jsonResponse(item, 201)
    }
    if (url === `${STANDARD_BASE}/bulk_destroy` && method === 'POST') {
      const deleted = db.filter((item) => body.ids.includes(item.id))
      for (const item of deleted) db.splice(db.indexOf(item), 1)
      return jsonResponse({ deleted_ids: deleted.map((item) => item.id) })
    }

    const item = db.find((i) => url === `${STANDARD_BASE}/${i.id}`)
    if (!item) return jsonResponse({ error: 'Standard item not found' }, 404)
    if (method === 'PATCH') return save(item, body.standard_item) ?? jsonResponse(item)
    if (method === 'DELETE') {
      db.splice(db.indexOf(item), 1)
      return new Response(null, { status: 204 })
    }
    throw new Error(`Onverwachte request: ${method} ${url}`)
  })

  return { db, fetch }
}
