import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { LEGACY_STORAGE_KEY, normalizeName, useShoppingListStore } from '../stores/shoppingList'
import { fakeServer, jsonResponse, mockFetch } from './helpers'

const PANCAKES = { label: 'Pannenkoeken', recipeId: 1 }
const WAFFLES = { label: 'Wafels', recipeId: 2 }

const BLOEM = { id: 1, name: 'bloem', quantity: 250, unit: 'g', source_label: 'Pannenkoeken' }
const ZOUT = { id: 2, name: 'zout', source_label: 'Pannenkoeken' }
const MELK = { id: 3, name: 'melk', source_label: 'standaard', checked: true }

// Een nieuwe Pinia is als een herladen pagina: de store begint leeg en haalt de lijst op.
function freshStore() {
  setActivePinia(createPinia())
  return useShoppingListStore()
}

async function loadedStore() {
  const list = freshStore()
  await list.load()
  return list
}

function requestsOf(fetch, method) {
  return fetch.mock.calls.filter(([, options]) => (options.method ?? 'GET') === method)
}

function bodyOf(call) {
  return JSON.parse(call[1].body)
}

// Een request die pas antwoordt als de test dat zegt.
function deferred() {
  let resolve
  const promise = new Promise((r) => (resolve = r))
  return { promise, resolve }
}

describe('boodschappenlijst-store', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('begint leeg en niet geladen, zonder iets in localStorage te zetten', () => {
    const list = freshStore()

    expect(list.items).toEqual([])
    expect(list.loaded).toBe(false)
    expect(localStorage.length).toBe(0)
  })

  it('laadt de lijst van de API, zonder beheercode', async () => {
    const { fetch } = fakeServer({ shopping: [BLOEM, ZOUT, MELK] })
    const list = await loadedStore()

    expect(fetch.mock.calls[0][0]).toBe('/api/shopping_list_items')
    expect(fetch.mock.calls[0][1].headers?.Authorization).toBeUndefined()
    expect(list.items.map((i) => i.name)).toEqual(['bloem', 'zout', 'melk'])
    expect(list.loaded).toBe(true)
  })

  it('telt alleen niet-afgevinkte regels als open, uit de API-data', async () => {
    fakeServer({ shopping: [BLOEM, ZOUT, MELK] })
    const list = await loadedStore()

    expect(list.openCount).toBe(2)
    expect(list.hasChecked).toBe(true)
  })

  it('doet maar één request als twee plekken tegelijk laden', async () => {
    const { fetch } = fakeServer({ shopping: [BLOEM] })
    const list = freshStore()

    await Promise.all([list.load(), list.load()])

    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('gooit een fout door bij laden, en blijft dan niet-geladen', async () => {
    mockFetch(() => jsonResponse({}, 500))
    const list = freshStore()

    await expect(list.load()).rejects.toMatchObject({ kind: 'server' })
    expect(list.loaded).toBe(false)
  })

  it('normaliseert namen', () => {
    expect(normalizeName('  Rode   Ui ')).toBe('rode ui')
  })

  describe('toevoegen', () => {
    it('stuurt een heel recept in één request, met herkomst en recept-id', async () => {
      const { fetch } = fakeServer()
      const list = await loadedStore()

      await list.addIngredients(
        [
          { name: 'bloem', quantity: 250, unit: 'g' },
          { name: 'zout', quantity: null, unit: 'g' },
        ],
        PANCAKES,
      )

      const posts = requestsOf(fetch, 'POST')
      expect(posts).toHaveLength(1)
      expect(bodyOf(posts[0])).toEqual({
        shopping_list_items: [
          { name: 'bloem', quantity: 250, unit: 'g', source_label: 'Pannenkoeken', recipe_id: 1 },
          // "Naar smaak" gaat zonder eenheid.
          { name: 'zout', quantity: null, unit: null, source_label: 'Pannenkoeken', recipe_id: 1 },
        ],
      })
      expect(list.items.map((i) => i.name)).toEqual(['bloem', 'zout'])
    })

    it('zet dezelfde naam uit een ander recept als eigen regel erbij, met eigen herkomst', async () => {
      fakeServer({ shopping: [{ ...BLOEM, checked: true }] })
      const list = await loadedStore()

      await list.add({ name: 'Bloem', quantity: 100, unit: 'g' }, WAFFLES)

      expect(
        list.items.map((i) => [i.name, i.quantity, i.source_label, i.recipe_id, i.checked]),
      ).toEqual([
        ['bloem', 250, 'Pannenkoeken', null, true],
        ['bloem', 100, 'Wafels', 2, false],
      ])
    })

    it('doet niets met een lege lijst', async () => {
      const { fetch } = fakeServer()
      const list = await loadedStore()

      await list.addIngredients([], PANCAKES)

      expect(requestsOf(fetch, 'POST')).toHaveLength(0)
    })

    it('gooit een fout door en laat de lijst ongemoeid', async () => {
      fakeServer({ shopping: [BLOEM] })
      const list = await loadedStore()
      mockFetch(() => jsonResponse({ error: 'Too many requests' }, 429))

      await expect(
        list.add({ name: 'ei', quantity: 1, unit: 'stuks' }, WAFFLES),
      ).rejects.toMatchObject({ kind: 'rate_limited' })
      expect(list.items.map((i) => i.name)).toEqual(['bloem'])
    })
  })

  describe('afvinken (optimistisch)', () => {
    it('toont het vinkje meteen, nog voordat de server antwoordt', async () => {
      const { shoppingDb } = fakeServer({ shopping: [BLOEM] })
      const list = await loadedStore()
      const answer = deferred()
      const fetch = mockFetch(() => answer.promise)

      const toggling = list.toggle(1)

      expect(list.items[0].checked).toBe(true)
      expect(list.openCount).toBe(0)
      expect(bodyOf(fetch.mock.calls[0])).toEqual({ shopping_list_item: { checked: true } })
      answer.resolve(jsonResponse({ ...shoppingDb[0], checked: true }))
      await toggling
      expect(list.items[0].checked).toBe(true)
    })

    it('draait het vinkje terug als de server weigert, en gooit de fout door', async () => {
      fakeServer({ shopping: [BLOEM] })
      const list = await loadedStore()
      mockFetch(() => jsonResponse({}, 500))

      await expect(list.toggle(1)).rejects.toMatchObject({ kind: 'server' })

      expect(list.items[0].checked).toBe(false)
    })

    it('draait ook terug zonder netwerk', async () => {
      fakeServer({ shopping: [MELK] })
      const list = await loadedStore()
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

      await expect(list.toggle(3)).rejects.toMatchObject({ kind: 'network' })

      expect(list.items[0].checked).toBe(true)
    })

    it('haalt de regel weg als iemand anders hem al verwijderde', async () => {
      const { shoppingDb } = fakeServer({ shopping: [BLOEM, ZOUT] })
      const list = await loadedStore()
      shoppingDb.splice(0, 1)

      await expect(list.toggle(1)).rejects.toMatchObject({ kind: 'not_found' })

      expect(list.items.map((i) => i.name)).toEqual(['zout'])
    })

    it('laat een verversing die tijdens het afvinken binnenkomt het vinkje niet overschrijven', async () => {
      fakeServer({ shopping: [BLOEM] })
      const list = await loadedStore()
      const patch = deferred()
      // De GET antwoordt met de oude stand (nog niet afgevinkt); de PATCH hangt nog.
      mockFetch((method) =>
        method === 'PATCH' ? patch.promise : jsonResponse([{ ...BLOEM, checked: false }]),
      )

      const toggling = list.toggle(1)
      await list.load()

      expect(list.items[0].checked).toBe(true)
      patch.resolve(jsonResponse({ ...BLOEM, checked: true }))
      await toggling
    })
  })

  describe('verwijderen en wissen', () => {
    it('verwijdert één regel op de server', async () => {
      const { shoppingDb } = fakeServer({ shopping: [BLOEM, ZOUT] })
      const list = await loadedStore()

      await list.remove(1)

      expect(list.items.map((i) => i.name)).toEqual(['zout'])
      expect(shoppingDb.map((i) => i.name)).toEqual(['zout'])
    })

    it('vindt het goed als de regel al weg was (404)', async () => {
      const { shoppingDb } = fakeServer({ shopping: [BLOEM] })
      const list = await loadedStore()
      shoppingDb.splice(0)

      await list.remove(1)

      expect(list.items).toEqual([])
    })

    it('wist afgevinkte regels en daarna alles, via de collectie-routes', async () => {
      const { fetch, shoppingDb } = fakeServer({ shopping: [BLOEM, ZOUT, MELK] })
      const list = await loadedStore()

      await list.clearChecked()
      expect(list.items.map((i) => i.name)).toEqual(['bloem', 'zout'])
      expect(shoppingDb).toHaveLength(2)

      await list.clearAll()
      expect(list.items).toEqual([])
      expect(shoppingDb).toEqual([])
      expect(requestsOf(fetch, 'DELETE').map(([url]) => url)).toEqual([
        '/api/shopping_list_items/clear_checked',
        '/api/shopping_list_items/clear_all',
      ])
    })

    it('houdt de regels als wissen mislukt', async () => {
      fakeServer({ shopping: [BLOEM, MELK] })
      const list = await loadedStore()
      mockFetch(() => jsonResponse({}, 500))

      await expect(list.clearAll()).rejects.toMatchObject({ kind: 'server' })
      expect(list.items).toHaveLength(2)
    })
  })

  describe('import van de oude lijst uit localStorage', () => {
    const LEGACY = [
      {
        key: 'bloem|g',
        name: 'bloem',
        unit: 'g',
        quantity: 200,
        checked: false,
        sources: [
          { id: 1, title: 'Pannenkoeken' },
          { id: 'standaard', title: 'standaard' },
        ],
      },
      { key: 'zout|', name: 'zout', unit: null, quantity: null, checked: true, sources: [] },
    ]

    function storeLegacy(items, version = 1) {
      localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ version, items }))
    }

    it('leest de oude lijst bij het starten', () => {
      storeLegacy(LEGACY)

      expect(freshStore().legacyItems).toEqual([
        {
          name: 'bloem',
          quantity: 200,
          unit: 'g',
          source_label: 'Pannenkoeken, standaard',
          checked: false,
        },
        { name: 'zout', quantity: null, unit: null, source_label: null, checked: true },
      ])
    })

    it('negeert kapotte, onbekende of lege data', () => {
      for (const raw of [
        '{kapot',
        JSON.stringify({ version: 99, items: LEGACY }),
        JSON.stringify({ version: 1, items: 'nee' }),
        JSON.stringify(['bloem']),
      ]) {
        localStorage.setItem(LEGACY_STORAGE_KEY, raw)
        expect(freshStore().legacyItems).toEqual([])
      }
    })

    it('slaat losse ongeldige regels over en houdt de rest', () => {
      storeLegacy([LEGACY[0], null, { name: '' }, { name: 'x'.repeat(101) }, 'tekst'])

      expect(freshStore().legacyItems.map((i) => i.name)).toEqual(['bloem'])
    })

    it('zet alles in één request op de server, zonder recept-id, en wist daarna de sleutel', async () => {
      storeLegacy(LEGACY)
      const { fetch, shoppingDb } = fakeServer({ shopping: [BLOEM] })
      const list = await loadedStore()

      expect(await list.importLegacy()).toBe(2)

      const [post] = requestsOf(fetch, 'POST')
      expect(bodyOf(post).shopping_list_items.every((i) => !('recipe_id' in i))).toBe(true)
      // Bloem stond er al: de oude bloem komt er als eigen regel bij. Zout blijft afgevinkt.
      expect(shoppingDb.map((i) => [i.name, i.quantity, i.checked])).toEqual([
        ['bloem', 250, false],
        ['bloem', 200, false],
        ['zout', null, true],
      ])
      expect(list.items).toHaveLength(3)
      expect(list.legacyItems).toEqual([])
      expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull()
    })

    it('stuurt een lange lijst in delen van 100', async () => {
      storeLegacy(
        Array.from({ length: 150 }, (_, i) => ({ ...LEGACY[1], key: `${i}`, name: `item ${i}` })),
      )
      const { fetch } = fakeServer()
      const list = await loadedStore()

      expect(await list.importLegacy()).toBe(150)

      const posts = requestsOf(fetch, 'POST').map((call) => bodyOf(call).shopping_list_items.length)
      expect(posts).toEqual([100, 50])
    })

    it('houdt de sleutel als de import mislukt, zodat je het opnieuw kunt proberen', async () => {
      storeLegacy(LEGACY)
      fakeServer()
      const list = await loadedStore()
      mockFetch(() => jsonResponse({}, 500))

      await expect(list.importLegacy()).rejects.toMatchObject({ kind: 'server' })

      expect(localStorage.getItem(LEGACY_STORAGE_KEY)).not.toBeNull()
      expect(list.legacyItems).toHaveLength(2)
    })
  })
})
