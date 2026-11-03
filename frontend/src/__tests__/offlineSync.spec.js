import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useOfflineStore } from '../stores/offline'
import { useShoppingListStore } from '../stores/shoppingList'
import { useSnapshotStore } from '../stores/snapshot'
import { useStandardItemsStore } from '../stores/standardItems'
import { clearMemoryStorage, readJson } from '../offline/storage'
import { parseLooseItem } from '../utils/offlineShoppingList'
import { fakeServer, jsonResponse, mockFetch } from './helpers'

// Offline wijzigingen op de boodschappenlijst en de standaardlijst: meteen zichtbaar
// ("wacht op sync"), in de outbox (src/offline/outbox.js), en bij verbinding in volgorde
// naar de server. Zonder IndexedDB in jsdom blijft de opslag in het geheugen; een nieuwe
// Pinia is dan een herladen pagina.

const PANCAKES = {
  id: 7,
  title: 'Pannenkoeken',
  servings: 4,
  ingredients: [
    {
      id: 1,
      ingredient_id: 10,
      name: 'bloem',
      quantity: 250,
      unit: 'g',
      optional: false,
      alternatives: [],
    },
    {
      id: 2,
      ingredient_id: 11,
      name: 'melk',
      quantity: 500,
      unit: 'ml',
      optional: false,
      alternatives: [],
    },
    {
      id: 3,
      ingredient_id: 12,
      name: 'zout',
      quantity: null,
      unit: null,
      optional: true,
      alternatives: [],
    },
  ],
  variations: [],
  tags: [],
  automatic_tags: [],
}

function freshStores() {
  setActivePinia(createPinia())
  return {
    list: useShoppingListStore(),
    standard: useStandardItemsStore(),
    offline: useOfflineStore(),
    snapshot: useSnapshotStore(),
  }
}

function goOffline() {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
}

function goOnline() {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
}

function writes(fetch) {
  return fetch.mock.calls
    .filter(([url, options]) => (options.method ?? 'GET') !== 'GET' && url !== '/up')
    .map(([url, options]) => [options.method, url, options.body ? JSON.parse(options.body) : null])
}

function queuedTypes() {
  return (readJson('outbox')?.actions ?? []).map((action) => action.type)
}

// Online laden (lijst, standaardlijst en snapshot), dan offline.
async function loadedThenOffline(server) {
  const stores = freshStores()
  await stores.snapshot.load()
  await stores.list.load()
  await stores.standard.load()
  server.fetch.mockClear()
  goOffline()
  return stores
}

describe('offline wijzigingen', () => {
  beforeEach(() => {
    localStorage.clear()
    clearMemoryStorage()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe('los item', () => {
    it('leest een aantal voor of achter de naam, en verder niets', () => {
      expect(parseLooseItem('3 uien')).toEqual({ name: 'uien', count: 3 })
      expect(parseLooseItem('uien 3')).toEqual({ name: 'uien', count: 3 })
      expect(parseLooseItem('  rode  ui ')).toEqual({ name: 'rode ui', count: 1 })
      expect(parseLooseItem('7up')).toEqual({ name: '7up', count: 1 })
      expect(parseLooseItem('3')).toEqual({ name: '3', count: 1 })
      expect(parseLooseItem('100 g kaas')).toEqual({ name: '100 g kaas', count: 1 })
      expect(parseLooseItem('0 eieren')).toEqual({ name: '0 eieren', count: 1 })
    })

    it('online: een nieuwe losse regel, met een client_action_id', async () => {
      const server = fakeServer()
      const { list } = freshStores()
      await list.load()

      const line = await list.addLoose('appels', { count: 3 })

      expect(line).toMatchObject({ name: 'appels', count: 3, source_label: 'los' })
      expect(writes(server.fetch)).toEqual([
        [
          'POST',
          '/api/shopping_list_items/add',
          { name: 'appels', count: 3, ingredient_id: null, client_action_id: expect.any(String) },
        ],
      ])
    })

    it('offline meteen te zien als "wacht op sync"; online één request, daarna de stand van de server', async () => {
      const server = fakeServer()
      const { list, offline } = await loadedThenOffline(server)

      await list.addLoose('appels', { count: 2 })

      expect(list.items).toEqual([
        expect.objectContaining({ name: 'appels', count: 2, pending: true, source_label: 'los' }),
      ])
      expect(offline.pending).toBe(1)
      expect(server.fetch).not.toHaveBeenCalled()

      goOnline()
      await list.load()

      expect(server.shoppingDb).toEqual([expect.objectContaining({ name: 'appels', count: 2 })])
      expect(list.items).toEqual([expect.objectContaining({ id: server.shoppingDb[0].id })])
      expect(list.items[0].pending).toBeUndefined()
      expect(offline.pending).toBe(0)
    })

    it('twee keer hetzelfde offline: één regel en één request, opgeteld', async () => {
      const server = fakeServer()
      const { list } = await loadedThenOffline(server)

      await list.addLoose('appels', { count: 2 })
      await list.addLoose('Appels', { count: 1 })

      expect(list.items.map((i) => [i.name, i.count])).toEqual([['appels', 3]])
      goOnline()
      await list.load()
      expect(writes(server.fetch)).toHaveLength(1)
      expect(server.shoppingDb.map((i) => [i.name, i.count])).toEqual([['appels', 3]])
    })

    it('telt offline op bij een regel van de server, en daar ook na de sync', async () => {
      const server = fakeServer({
        shopping: [{ id: 5, name: 'ui', ingredient_id: 20, count: 1 }],
      })
      const { list } = await loadedThenOffline(server)

      await list.addLoose('ui', { ingredientId: 20, count: 2 })

      expect(list.items).toEqual([expect.objectContaining({ id: 5, count: 3, pending: true })])
      goOnline()
      await list.load()
      expect(server.shoppingDb.map((i) => [i.id, i.count])).toEqual([[5, 3]])
    })

    it('offline toegevoegd en weer weggehaald: de server hoort er nooit van', async () => {
      const server = fakeServer()
      const { list, offline } = await loadedThenOffline(server)

      const line = await list.addLoose('appels')
      await list.setCount(line.id, 4)
      await list.remove(line.id)

      expect(list.items).toEqual([])
      expect(offline.pending).toBe(0)
      goOnline()
      await list.load()
      expect(writes(server.fetch)).toEqual([])
    })

    it('het aantal en afstrepen van een offline regel gaan mee in dat ene request', async () => {
      const server = fakeServer()
      const { list } = await loadedThenOffline(server)

      const line = await list.addLoose('appels')
      await list.setCount(line.id, 4)
      await list.toggle(line.id)

      goOnline()
      await list.load()
      expect(writes(server.fetch)).toEqual([
        [
          'POST',
          '/api/shopping_list_items/add',
          expect.objectContaining({ name: 'appels', count: 4, checked: true }),
        ],
      ])
    })
  })

  describe('vanuit een recept', () => {
    it('"Alles op lijst" offline: regels uit de snapshot, op slot tot de sync; de server slaat in-huis over', async () => {
      const server = fakeServer({ recipes: [PANCAKES], presentIds: [11] })
      const { list } = await loadedThenOffline(server)

      const lines = await list.addRecipe(7, 8, null, [], [2])

      // Het voorbeeld: verdubbeld, zonder het optionele zout en zonder wat in huis is.
      expect(lines.map((l) => [l.name, l.quantity, l.unit, l.locked, l.pending])).toEqual([
        ['bloem', 500, 'g', true, true],
      ])
      await list.toggle(lines[0].id)
      expect(list.items[0].checked).toBe(false)

      goOnline()
      await list.load()
      const [[, url, body]] = writes(server.fetch)
      expect(url).toBe('/api/recipes/7/add_to_shopping_list')
      expect(body).toEqual({
        servings: 8,
        skip_in_house: true,
        client_action_id: expect.any(String),
      })
      expect(server.shoppingDb.map((i) => [i.name, i.quantity])).toEqual([['bloem', 500]])
    })

    it('verbinding weg terwijl het request onderweg is: via de outbox, en de server zet niets dubbel', async () => {
      const server = fakeServer({ recipes: [PANCAKES] })
      const { list } = freshStores()
      await useSnapshotStore().load()
      await list.load()
      // De server slaat op, maar het antwoord komt nooit aan.
      const real = globalThis.fetch
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url, options) => {
          await real(url, options)
          throw new TypeError('Failed to fetch')
        }),
      )

      const lines = await list.addRecipe(7, 4)

      expect(lines.every((line) => line.pending)).toBe(true)
      expect(server.shoppingDb).toHaveLength(2)
      vi.stubGlobal('fetch', real)
      await list.load()
      expect(server.shoppingDb).toHaveLength(2)
      expect(list.items.map((i) => i.name)).toEqual(['bloem', 'melk'])
    })
  })

  describe('standaardlijst', () => {
    it('offline toevoegen en bewerken: één create met de laatste naam', async () => {
      const server = fakeServer({ standard: [{ id: 1, name: 'melk' }] })
      const { standard } = await loadedThenOffline(server)

      const item = await standard.add({ name: ' Brood ', category: 'Bakker' })
      await standard.update(item.id, { name: 'volkorenbrood', category: 'bakker' })

      expect(standard.items).toContainEqual(
        expect.objectContaining({ name: 'volkorenbrood', category: 'bakker', pending: true }),
      )
      goOnline()
      await standard.load()
      expect(writes(server.fetch)).toEqual([
        [
          'POST',
          '/api/standard_items',
          {
            standard_item: {
              name: 'volkorenbrood',
              category: 'bakker',
              client_id: expect.any(String),
            },
          },
        ],
      ])
      expect(standard.items.map((i) => i.name)).toEqual(['melk', 'volkorenbrood'])
    })

    it('weigert offline al een dubbele naam, zoals de server', async () => {
      const server = fakeServer({ standard: [{ id: 1, name: 'melk' }] })
      const { standard } = await loadedThenOffline(server)

      await expect(standard.add({ name: 'Melk' })).rejects.toMatchObject({
        kind: 'validation',
        errors: { name: ['is al in gebruik'] },
      })
    })

    it('in volgorde: eerst het nieuwe item, dan op de lijst (op naam), dan weghalen', async () => {
      const server = fakeServer({ standard: [{ id: 1, name: 'melk' }] })
      const { standard, list } = await loadedThenOffline(server)

      const item = await standard.add({ name: 'brood' })
      await standard.addToShoppingList([item.id, 1])
      await standard.remove(1)

      expect(list.items.map((i) => [i.name, i.locked])).toEqual([
        ['brood', true],
        ['melk', true],
      ])
      goOnline()
      await list.load()
      expect(writes(server.fetch).map(([method, url, body]) => [method, url, body?.names])).toEqual(
        [
          ['POST', '/api/standard_items', undefined],
          ['POST', '/api/standard_items/add_to_shopping_list', ['brood', 'melk']],
          ['DELETE', '/api/standard_items/1', undefined],
        ],
      )
      expect(server.standardDb.map((i) => i.name)).toEqual(['brood'])
      expect(server.shoppingDb.map((i) => [i.name, i.count])).toEqual([
        ['brood', 1],
        ['melk', 1],
      ])
    })
  })

  describe('versturen', () => {
    it('404: overslaan; 422: laten vallen met één melding; de rest gaat door', async () => {
      const server = fakeServer({
        standard: [{ id: 1, name: 'melk' }],
        shopping: [{ id: 5, name: 'kaas' }],
      })
      const { standard, list, offline } = await loadedThenOffline(server)
      await standard.add({ name: 'brood' })
      await list.toggle(5)
      await list.addLoose('appels')
      // Intussen, op een ander apparaat: brood bestaat al, kaas is weg.
      server.standardDb.push({ id: 2, name: 'brood', category: null })
      server.shoppingDb.splice(0)

      goOnline()
      await list.load()

      expect(offline.notice).toBe(
        'Een wijziging van toen je offline was, is niet opgeslagen: Controleer de ingevulde velden.',
      )
      expect(offline.pending).toBe(0)
      expect(server.shoppingDb.map((i) => i.name)).toEqual(['appels'])
    })

    it('zonder netwerk blijft alles staan, ook na herladen', async () => {
      const server = fakeServer({ shopping: [{ id: 5, name: 'kaas' }] })
      const { list } = await loadedThenOffline(server)
      await list.addLoose('appels')
      await list.toggle(5)

      const reloaded = freshStores()
      await reloaded.list.load()

      expect(reloaded.list.items.map((i) => [i.name, i.checked, i.pending ?? false])).toEqual([
        ['kaas', true, false],
        ['appels', false, true],
      ])
      expect(queuedTypes()).toEqual(['shopping.addLoose', 'shopping.check'])
    })

    it('een serverfout (500) laat de outbox staan voor de volgende keer', async () => {
      const server = fakeServer()
      const { list, offline } = await loadedThenOffline(server)
      await list.addLoose('appels')
      goOnline()
      mockFetch((method) => (method === 'POST' ? jsonResponse({}, 500) : jsonResponse([])))

      await list.load()

      expect(offline.pending).toBe(1)
      expect(offline.notice).toBeNull()
    })
  })

  describe('snapshot', () => {
    it('stuurt de ETag mee: bij 304 blijft de kopie, met een nieuw tijdstip', async () => {
      const server = fakeServer({ recipes: [PANCAKES] })
      vi.spyOn(Date, 'now').mockReturnValue(1_000)
      const { snapshot } = freshStores()
      await snapshot.load()
      const etag = snapshot.etag
      expect(snapshot.recipe(7).title).toBe('Pannenkoeken')

      Date.now.mockReturnValue(2_000)
      const reloaded = freshStores().snapshot
      await reloaded.load()

      const [, options] = server.fetch.mock.calls
        .filter(([url]) => url === '/api/offline_snapshot')
        .at(-1)
      expect(options.headers['If-None-Match']).toBe(etag)
      expect(reloaded.recipe(7).title).toBe('Pannenkoeken')
      expect(reloaded.savedAt).toBe(2_000)
    })

    it('offline: geen request, de kopie van de vorige keer', async () => {
      const server = fakeServer({ recipes: [PANCAKES] })
      await freshStores().snapshot.load()
      server.fetch.mockClear()
      goOffline()

      const { snapshot } = freshStores()
      await snapshot.load()

      expect(server.fetch).not.toHaveBeenCalled()
      expect(snapshot.recipes).toHaveLength(1)
    })
  })
})
