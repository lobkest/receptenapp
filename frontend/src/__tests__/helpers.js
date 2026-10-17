import { vi } from 'vitest'

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Vervangt fetch door een nep-server: handler(method, url, options) geeft per
// request een Response terug. Elke aanroep krijgt een nieuwe Response, want een
// body kan maar één keer gelezen worden. De health check (/up, src/stores/serverStatus.js)
// is altijd meteen online.
export function mockFetch(handler) {
  const fake = vi.fn(async (url, options = {}) =>
    url === '/up' ? new Response('', { status: 200 }) : handler(options.method ?? 'GET', url, options),
  )
  vi.stubGlobal('fetch', fake)
  return fake
}

export function authHeaderOf(call) {
  return call[1].headers.Authorization
}

const STANDARD_BASE = '/api/standard_items'
const SHOPPING_BASE = '/api/shopping_list_items'

function normalize(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

function nextIdAfter(db) {
  return Math.max(0, ...db.map((item) => item.id)) + 1
}

// De standaardlijst, zoals de Rails-controller: openbaar, namen genormaliseerd en uniek,
// bulk_destroy alles of niets. Geeft null voor een URL die hier niet hoort.
function standardRoutes(initial) {
  const db = initial.map((item) => ({ category: null, ...item }))
  let nextId = nextIdAfter(db)

  function save(item, fields) {
    const name = normalize(fields.name)
    if (!name) return jsonResponse({ errors: { name: ['moet opgegeven zijn'] } }, 422)
    if (db.some((other) => other !== item && other.name === name)) {
      return jsonResponse({ errors: { name: ['is al in gebruik'] } }, 422)
    }
    Object.assign(item, { name, category: normalize(fields.category) || null })
    return null
  }

  function handle(method, url, body) {
    if (!url.startsWith(STANDARD_BASE)) return null
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
    return null
  }

  return { db, handle }
}

// De boodschappenlijst: elke toevoeging wordt een eigen regel, net als op de server.
function shoppingRoutes(initial) {
  const db = initial.map((item) => ({
    quantity: null,
    unit: null,
    source_label: null,
    recipe_id: null,
    checked: false,
    ...item,
  }))
  let nextId = nextIdAfter(db)

  function add(fields) {
    const quantity = fields.quantity ?? null
    const item = {
      id: nextId++,
      name: normalize(fields.name),
      quantity,
      unit: quantity == null ? null : fields.unit,
      source_label: fields.source_label ?? null,
      recipe_id: fields.recipe_id ?? null,
      checked: fields.checked ?? false,
    }
    db.push(item)
    return item
  }

  function handle(method, url, body) {
    if (!url.startsWith(SHOPPING_BASE)) return null
    if (url === SHOPPING_BASE && method === 'GET') return jsonResponse(structuredClone(db))
    if (url === SHOPPING_BASE && method === 'POST') {
      const list = body.shopping_list_items ?? [body.shopping_list_item]
      if (list.some((fields) => !normalize(fields.name))) {
        return jsonResponse({ errors: { name: ['moet opgegeven zijn'] } }, 422)
      }
      const lines = list.map(add)
      return jsonResponse(structuredClone(body.shopping_list_items ? lines : lines[0]), 201)
    }
    if (url === `${SHOPPING_BASE}/clear_checked` && method === 'DELETE') {
      db.splice(0, db.length, ...db.filter((item) => !item.checked))
      return new Response(null, { status: 204 })
    }
    if (url === `${SHOPPING_BASE}/clear_all` && method === 'DELETE') {
      db.splice(0, db.length)
      return new Response(null, { status: 204 })
    }

    const item = db.find((i) => url === `${SHOPPING_BASE}/${i.id}`)
    if (!item) return jsonResponse({ error: 'Shopping list item not found' }, 404)
    if (method === 'PATCH') {
      const { checked, name } = body.shopping_list_item
      if (checked !== undefined) item.checked = checked
      if (name !== undefined) item.name = normalize(name)
      return jsonResponse(structuredClone(item))
    }
    if (method === 'DELETE') {
      db.splice(db.indexOf(item), 1)
      return new Response(null, { status: 204 })
    }
    return null
  }

  return { db, handle }
}

// Een nep-server voor beide lijsten. standardDb en shoppingDb zijn de "database":
// tests kunnen erin kijken en erin schrijven (alsof een ander apparaat iets wijzigt).
export function fakeServer({ standard = [], shopping = [] } = {}) {
  const standardServer = standardRoutes(standard)
  const shoppingServer = shoppingRoutes(shopping)

  const fetch = mockFetch((method, url, options) => {
    const body = options.body ? JSON.parse(options.body) : {}
    const response =
      standardServer.handle(method, url, body) ?? shoppingServer.handle(method, url, body)
    if (!response) throw new Error(`Onverwachte request: ${method} ${url}`)
    return response
  })

  return { fetch, standardDb: standardServer.db, shoppingDb: shoppingServer.db }
}

// Kortere vorm voor de standaardlijst-tests: db is de standaardlijst.
export function fakeStandardServer(initial = []) {
  const server = fakeServer({ standard: initial })
  return { ...server, db: server.standardDb }
}
