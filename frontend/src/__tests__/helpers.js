import { vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { isOffline } from '../offline'
import { useServerStatusStore } from '../stores/serverStatus'

// De serverstatus zoals App.vue hem zou zetten (stores/serverStatus.js): alleen 'online'
// is online; tot /up antwoordt is de app offline en gaat alles via de outbox.
//   setOffline(): de browser meldt geen netwerk ('offline'-event → markOffline)
//   setOnline():  het netwerk is terug en /up gaf meteen 200
// Herstel navigator.onLine met vi.restoreAllMocks().
export function setOffline() {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  useServerStatusStore().markOffline()
}

export function setOnline() {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  const server = useServerStatusStore()
  server.browserOffline = false
  server.setStatus('online')
}

// Na een nieuwe Pinia (een herladen pagina) zonder App: doen alsof /up meteen antwoordde,
// zoals mockFetch hieronder; offline als de browser offline is. Een status die de test al
// zelf zette, blijft staan.
export function serverOnlineUnlessOffline() {
  const server = useServerStatusStore()
  if (server.status !== 'waking') return
  if (isOffline()) server.markOffline()
  else server.setStatus('online')
}

// De verbinding valt weg terwijl de pagina open is ('offline'-event → markOffline).
export async function goOffline() {
  setOffline()
  await flushPromises()
}

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
    url === '/up'
      ? new Response('', { status: 200 })
      : handler(options.method ?? 'GET', url, options),
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
// bulk_destroy alles of niets. Een POST met een bekende client_id geeft dat item terug (200).
// Geeft null voor een URL die hier niet hoort.
function standardRoutes(initial) {
  const db = initial.map((item) => ({ category: null, ...item }))
  let nextId = nextIdAfter(db)
  // item → client_id, buiten het item zelf: de API stuurt hem niet terug.
  const clientIds = new WeakMap()

  function save(item, fields) {
    const name = normalize(fields.name)
    if (!name) return jsonResponse({ errors: { name: ['moet opgegeven zijn'] } }, 422)
    if (db.some((other) => other !== item && other.name === name)) {
      return jsonResponse({ errors: { name: ['is al in gebruik'] } }, 422)
    }
    if (normalize(fields.category) === 'tijdelijk') {
      return jsonResponse(
        { errors: { category: ['kan niet "Tijdelijk" zijn, die naam is gereserveerd'] } },
        422,
      )
    }
    const category = normalize(fields.category) || null
    Object.assign(item, { name, category })
    // Zoals StandardItem: een categorie of temporary: false maakt een tijdelijk item
    // permanent. Alleen voor items met dat veld, zodat oudere tests hetzelfde item zien.
    if (item.temporary_last_used_at && (category != null || fields.temporary === false)) {
      item.temporary_last_used_at = null
    }
    return null
  }

  function handle(method, url, body) {
    if (!url.startsWith(STANDARD_BASE)) return null
    if (url === STANDARD_BASE && method === 'GET') {
      return jsonResponse(db.toSorted((a, b) => a.name.localeCompare(b.name)))
    }
    if (url === STANDARD_BASE && method === 'POST') {
      const clientId = body.standard_item.client_id
      const known = clientId && db.find((other) => clientIds.get(other) === clientId)
      if (known) return jsonResponse(known)
      const item = { id: nextId }
      const error = save(item, body.standard_item)
      if (error) return error
      nextId++
      db.push(item)
      if (clientId) clientIds.set(item, clientId)
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
    count: 1,
    standard_count: 0,
    ...item,
  }))
  let nextId = nextIdAfter(db)
  // client_action_id → de regels van de eerste keer (ClientAction op de server).
  const actions = new Map()

  // Zoals ClientAction.once: met een bekend id niets opnieuw, maar dezelfde regels terug.
  function once(id, fn) {
    if (id && actions.has(id)) return actions.get(id).filter((line) => db.includes(line))
    const lines = fn()
    if (id) actions.set(id, lines)
    return lines
  }

  const standardOnly = (item) => item.recipe_id == null && item.source_label === 'standaard'

  // Zoals ShoppingListItem.add_standard!: één erbij op een open regel met dezelfde naam
  // (liefst een standaardregel, anders de oudste), of een nieuwe standaardregel.
  function addStandard(name) {
    const matching = db.filter((item) => !item.checked && item.name === name)
    const line = matching.find(standardOnly) ?? matching[0]
    if (line) {
      line.count = Math.min(line.count + 1, 99)
      line.standard_count++
      return line
    }
    return add({ name, source_label: 'standaard', standard_count: 1 })
  }

  // Zoals ShoppingListItem.remove_standard!: van de open regels met die naam verdwijnt wat
  // alleen van de standaardlijst kwam; met een standaarddeel gaat dat eraf (en van count).
  function removeStandard(name) {
    const removed = []
    const kept = []
    for (const line of db.filter((item) => !item.checked && item.name === name)) {
      if (standardOnly(line)) {
        db.splice(db.indexOf(line), 1)
        removed.push(line.id)
      } else if (line.standard_count) {
        line.count = Math.max(line.count - line.standard_count, 1)
        line.standard_count = 0
        kept.push(structuredClone(line))
      }
    }
    return { removed, kept }
  }

  function result(item) {
    return jsonResponse({ item: item ? structuredClone(item) : null })
  }

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
      count: fields.count ?? 1,
      standard_count:
        fields.standard_count ??
        (fields.recipe_id == null && fields.source_label === 'standaard' ? 1 : 0),
    }
    db.push(item)
    return item
  }

  // Zoals ShoppingListItem.add_loose!: optellen bij een open regel zonder hoeveelheid voor
  // hetzelfde ingrediënt (of dezelfde naam), anders een nieuwe losse regel.
  function addLoose({ name, ingredient_id: ingredientId = null, count = 1, checked = false }) {
    const match =
      !checked &&
      db.find(
        (item) =>
          !item.checked &&
          item.quantity == null &&
          (ingredientId != null
            ? item.ingredient_id === ingredientId
            : item.name === normalize(name)),
      )
    if (match) {
      match.count = Math.min(match.count + count, 99)
      return match
    }
    const line = add({ name, count, checked, source_label: 'los' })
    line.ingredient_id = ingredientId
    return line
  }

  function handle(method, url, body) {
    if (!url.startsWith(SHOPPING_BASE)) return null
    if (url === SHOPPING_BASE && method === 'GET') return jsonResponse(structuredClone(db))
    if (url === `${SHOPPING_BASE}/add` && method === 'POST') {
      if (!normalize(body.name)) {
        return jsonResponse({ errors: { name: ['moet opgegeven zijn'] } }, 422)
      }
      const lines = once(body.client_action_id, () => [addLoose(body)])
      return jsonResponse(structuredClone(lines), 201)
    }
    if (url === SHOPPING_BASE && method === 'POST') {
      const list = body.shopping_list_items ?? [body.shopping_list_item]
      if (list.some((fields) => !normalize(fields.name))) {
        return jsonResponse({ errors: { name: ['moet opgegeven zijn'] } }, 422)
      }
      const lines = list.map(add)
      return jsonResponse(structuredClone(body.shopping_list_items ? lines : lines[0]), 201)
    }
    // Zoals ShoppingListItem.remove_recipe!: de open regels van één recept; met een
    // standaarddeel blijven ze staan als standaardregel.
    if (url.startsWith(`${SHOPPING_BASE}?`) && method === 'DELETE') {
      const query = new URLSearchParams(url.split('?')[1])
      const recipeId = query.has('recipe_id') ? Number(query.get('recipe_id')) : null
      const label = query.get('source_label')
      const lines = db.filter(
        (item) =>
          !item.checked &&
          (recipeId != null
            ? item.recipe_id === recipeId
            : item.recipe_id == null && item.source_label === label && label !== 'standaard'),
      )
      const removed = []
      const kept = []
      for (const line of lines) {
        if (line.standard_count) {
          Object.assign(line, {
            recipe_id: null,
            recipe_title: null,
            recipe_visible: false,
            quantity: null,
            unit: null,
            source_label: 'standaard',
            count: Math.max(line.count - 1, 1),
          })
          kept.push(structuredClone(line))
        } else {
          db.splice(db.indexOf(line), 1)
          removed.push(line.id)
        }
      }
      return jsonResponse({ removed_ids: removed, items: kept })
    }
    if (url === `${SHOPPING_BASE}/clear_checked` && method === 'DELETE') {
      db.splice(0, db.length, ...db.filter((item) => !item.checked))
      return new Response(null, { status: 204 })
    }
    if (url === `${SHOPPING_BASE}/clear_all` && method === 'DELETE') {
      db.splice(0, db.length)
      return new Response(null, { status: 204 })
    }

    const member = db.find((i) => url.startsWith(`${SHOPPING_BASE}/${i.id}/`))
    if (member && url.endsWith('/remove_recipe') && method === 'POST') {
      if (!member.standard_count) {
        db.splice(db.indexOf(member), 1)
        return result(null)
      }
      Object.assign(member, {
        recipe_id: null,
        quantity: null,
        unit: null,
        source_label: 'standaard',
        count: Math.max(member.count - 1, 1),
      })
      return result(member)
    }

    const item = db.find((i) => url === `${SHOPPING_BASE}/${i.id}`)
    if (!item) return jsonResponse({ error: 'Shopping list item not found' }, 404)
    if (method === 'PATCH') {
      const { checked, name, count } = body.shopping_list_item
      // Zoals de validatie van ShoppingListItem#count: een heel getal van 1 tot en met 99.
      if (count !== undefined && !(Number.isInteger(count) && count >= 1 && count <= 99)) {
        return jsonResponse(
          { error: 'Controleer de ingevulde velden.', errors: { count: ['is ongeldig'] } },
          422,
        )
      }
      if (checked !== undefined) item.checked = checked
      if (name !== undefined) item.name = normalize(name)
      if (count !== undefined) item.count = count
      return jsonResponse(structuredClone(item))
    }
    if (method === 'DELETE') {
      db.splice(db.indexOf(item), 1)
      return new Response(null, { status: 204 })
    }
    return null
  }

  return { db, handle, add, addStandard, removeStandard, once }
}

// Een korte, vaste ETag voor een JSON-antwoord: verandert als de inhoud verandert.
function etagOf(value) {
  const text = JSON.stringify(value)
  let hash = 0
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0
  return `W/"${hash.toString(16)}"`
}

// Een nep-server voor beide lijsten. standardDb en shoppingDb zijn de "database":
// tests kunnen erin kijken en erin schrijven (alsof een ander apparaat iets wijzigt).
// recipes (zoals /api/recipes/:id) en presentIds (in huis): voor "Alles op lijst" en de
// offline snapshot (GET /api/offline_snapshot, met ETag en 304). Zonder presentIds heeft de
// snapshot geen voorraad (dan geen huisjes, zoals in de tests van vóór de snapshot).
// ingredients ([{ id, name }]): GET /api/ingredients en de namen in de snapshot.
// linkPairs ([['uien', 'ui']]): wat "Mogelijk hetzelfde" zou vinden (standaarditem- en
// ingrediëntnaam); de nep-server laat gekoppelde items en afgewezen paren weg, zoals
// StandardItemLinkSuggestions.
export function fakeServer({
  standard = [],
  shopping = [],
  recipes = [],
  presentIds = null,
  ingredients = [],
  linkPairs = [],
} = {}) {
  const standardServer = standardRoutes(standard)
  const shoppingServer = shoppingRoutes(shopping)
  const rejected = new Set()

  // Zoals Recipe#shopping_list_items: zonder ingredient_ids alles behalve de optionele, en
  // met skip_in_house zonder wat nu in huis is. Geschaald, zonder afronding (de tests
  // gebruiken ronde getallen).
  function addRecipe(recipe, body) {
    const factor = (body.servings ?? recipe.servings) / recipe.servings
    const skip = new Set(body.skip_ingredient_ids ?? [])
    return recipe.ingredients
      .filter((row) => (body.ingredient_ids ? body.ingredient_ids.includes(row.id) : !row.optional))
      .filter((row) => !skip.has(row.id))
      .filter((row) => !(body.skip_in_house && presentIds?.includes(row.ingredient_id)))
      .map((row) =>
        shoppingServer.add({
          name: row.name,
          quantity: row.quantity == null ? null : row.quantity * factor,
          unit: row.unit,
          source_label: recipe.title,
          recipe_id: recipe.id,
        }),
      )
  }

  // Zoals Api::StandardItemsController#link_suggestions: per item de kandidaten.
  function linkSuggestions() {
    const result = []
    for (const [itemName, ingredientName] of linkPairs) {
      const item = standardServer.db.find((i) => i.name === itemName)
      const ingredient = ingredients.find((i) => i.name === ingredientName)
      if (!item || !ingredient || item.ingredient_id != null) continue
      if (rejected.has(`${item.id}-${ingredient.id}`)) continue
      let row = result.find((r) => r.standard_item.id === item.id)
      if (!row) result.push((row = { standard_item: structuredClone(item), candidates: [] }))
      row.candidates.push({ id: ingredient.id, name: ingredient.name })
    }
    return result
  }

  // link, unlink en reject_link op een item; null als de URL daar niet over gaat.
  function linkRoute(method, url, body) {
    if (url === `${STANDARD_BASE}/link_suggestions` && method === 'GET') {
      return jsonResponse(linkSuggestions())
    }
    const match = url.match(/^\/api\/standard_items\/(\d+)\/(link|unlink|reject_link)$/)
    if (!match || method !== 'POST') return null
    const item = standardServer.db.find((i) => i.id === Number(match[1]))
    if (!item) return jsonResponse({ error: 'Niet gevonden.' }, 404)
    if (match[2] === 'unlink') {
      item.ingredient_id = null
      return jsonResponse(structuredClone(item))
    }
    const ingredient = ingredients.find((i) => i.id === body.ingredient_id)
    if (!ingredient) return jsonResponse({ error: 'Niet gevonden.' }, 404)
    if (match[2] === 'reject_link') {
      rejected.add(`${item.id}-${ingredient.id}`)
      return new Response(null, { status: 204 })
    }
    // Zoals StandardItem#link_to!: ook de open regels met die naam zonder ingrediënt.
    item.ingredient_id = ingredient.id
    for (const line of shoppingServer.db) {
      if (!line.checked && line.name === item.name && line.ingredient_id == null) {
        line.ingredient_id = ingredient.id
      }
    }
    return jsonResponse(structuredClone(item))
  }

  const fetch = mockFetch((method, url, options) => {
    const body = options.body ? JSON.parse(options.body) : {}
    const linked = linkRoute(method, url, body)
    if (linked) return linked
    if (url === '/api/offline_snapshot' && method === 'GET') {
      const data = {
        recipes,
        tags: [],
        categories: [],
        ingredients,
        standard_items: standardServer.db,
        pantry: presentIds && {
          in_house: presentIds.map((id) => ({ id, name: `#${id}` })),
          staples: [],
          suggestions: [],
        },
      }
      const etag = etagOf(data)
      if (options.headers?.['If-None-Match'] === etag) return new Response(null, { status: 304 })
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ETag: etag },
      })
    }
    if (url === '/api/ingredients' && method === 'GET') return jsonResponse(ingredients)
    const recipeAdd = url.match(/^\/api\/recipes\/(\d+)\/add_to_shopping_list$/)
    if (recipeAdd && method === 'POST') {
      const recipe = recipes.find((r) => r.id === Number(recipeAdd[1]))
      if (!recipe) return jsonResponse({ error: 'Niet gevonden.' }, 404)
      const lines = shoppingServer.once(body.client_action_id, () => addRecipe(recipe, body))
      return jsonResponse(structuredClone(lines), 201)
    }
    if (url === `${STANDARD_BASE}/add_to_shopping_list` && method === 'POST') {
      // ids, of (vanuit de outbox) names; met client_action_id niets dubbel.
      const names = (
        body.names ??
        standardServer.db.filter((item) => body.ids.includes(item.id)).map((item) => item.name)
      ).sort()
      const lines = shoppingServer.once(body.client_action_id, () =>
        names.map(shoppingServer.addStandard),
      )
      return jsonResponse(structuredClone(lines))
    }
    if (url === `${STANDARD_BASE}/remove_from_shopping_list` && method === 'POST') {
      const results = [...new Set(body.names.map(normalize))]
        .sort()
        .map(shoppingServer.removeStandard)
      return jsonResponse({
        removed_ids: results.flatMap((r) => r.removed),
        items: results.flatMap((r) => r.kept),
      })
    }
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
