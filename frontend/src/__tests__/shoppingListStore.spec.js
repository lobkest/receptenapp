import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useShoppingListStore } from '../stores/shoppingList'
import { fakeServer, jsonResponse, mockFetch } from './helpers'
import { clearMemoryStorage } from '../offline/storage'

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

// De offline wachtrij zoals die in localStorage staat.
function queued() {
  return JSON.parse(localStorage.getItem('receptenapp:offline:shoppingList:queue') ?? '[]')
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
    clearMemoryStorage()
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

      await list.addIngredients([{ name: 'Bloem', quantity: 100, unit: 'g' }], WAFFLES)

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
      mockFetch(() =>
        jsonResponse({ error: 'Te veel verzoeken. Probeer het over een minuut opnieuw.' }, 429),
      )

      await expect(
        list.addIngredients([{ name: 'ei', quantity: 1, unit: 'stuks' }], WAFFLES),
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

    it('houdt het vinkje zonder netwerk, en zet de actie in de wachtrij', async () => {
      fakeServer({ shopping: [MELK] })
      const list = await loadedStore()
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

      await list.toggle(3)

      expect(list.items[0].checked).toBe(false)
      expect(list.offline).toBe(true)
      expect(queued()).toEqual([{ item_id: 3, checked: false, at: expect.any(String) }])
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

  describe('offline', () => {
    const QUEUE_KEY = 'receptenapp:offline:shoppingList:queue'
    const SNAPSHOT_KEY = 'receptenapp:offline:shoppingList:snapshot'

    function goOffline() {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    }

    function goOnline() {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    }

    function patchesOf(fetch) {
      return requestsOf(fetch, 'PATCH').map((call) => [call[0], bodyOf(call)])
    }

    it('slaat na elk ophalen een snapshot met tijdstempel op', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(1_000)
      fakeServer({ shopping: [BLOEM, MELK] })
      const list = await loadedStore()

      const snapshot = JSON.parse(localStorage.getItem(SNAPSHOT_KEY))
      expect(snapshot.savedAt).toBe(1_000)
      expect(snapshot.data.map((i) => i.name)).toEqual(['bloem', 'melk'])
      expect(list.savedAt).toBe(1_000)
      expect(list.offline).toBe(false)
    })

    it('werkt de snapshot ook bij na afvinken, toevoegen en verwijderen', async () => {
      fakeServer({ shopping: [BLOEM, ZOUT] })
      const list = await loadedStore()
      const snapshotNames = () =>
        JSON.parse(localStorage.getItem(SNAPSHOT_KEY)).data.map((i) => [i.name, i.checked])

      await list.toggle(1)
      expect(snapshotNames()).toEqual([
        ['bloem', true],
        ['zout', false],
      ])

      await list.remove(2)
      await list.addIngredients([{ name: 'ei', quantity: 2, unit: 'stuks' }], WAFFLES)
      expect(snapshotNames()).toEqual([
        ['bloem', true],
        ['ei', false],
      ])
    })

    it('toont bij openen meteen de snapshot, en ververst daarna online', async () => {
      fakeServer({ shopping: [BLOEM, ZOUT] })
      await loadedStore()
      const answer = deferred()
      mockFetch(() => answer.promise)

      const list = freshStore()
      const loading = list.load()

      // Nog voordat de server antwoordt: de opgeslagen lijst.
      expect(list.loaded).toBe(true)
      expect(list.items.map((i) => i.name)).toEqual(['bloem', 'zout'])
      answer.resolve(jsonResponse([{ ...ZOUT, checked: true }]))
      await loading
      expect(list.items.map((i) => [i.name, i.checked])).toEqual([['zout', true]])
    })

    it('toont offline de snapshot zonder request, met het tijdstip van opslaan', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(5_000)
      fakeServer({ shopping: [BLOEM, MELK] })
      await loadedStore()
      const fetch = mockFetch(() => jsonResponse([]))
      goOffline()

      const list = freshStore()
      await list.load()

      expect(fetch).not.toHaveBeenCalled()
      expect(list.offline).toBe(true)
      expect(list.savedAt).toBe(5_000)
      expect(list.items.map((i) => i.name)).toEqual(['bloem', 'melk'])
    })

    it('houdt de snapshot als de server niet te bereiken is, zonder fout', async () => {
      fakeServer({ shopping: [BLOEM] })
      await loadedStore()
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

      const list = freshStore()
      await list.load()

      expect(list.offline).toBe(true)
      expect(list.items.map((i) => i.name)).toEqual(['bloem'])
    })

    it('gooit offline zonder snapshot een netwerkfout', async () => {
      goOffline()
      const list = freshStore()

      await expect(list.load()).rejects.toMatchObject({ kind: 'network' })
      expect(list.loaded).toBe(false)
      expect(list.offline).toBe(true)
    })

    it('zet offline afvinken in de wachtrij als waarde, en voegt per regel samen', async () => {
      const { fetch } = fakeServer({ shopping: [BLOEM, ZOUT] })
      const list = await loadedStore()
      goOffline()

      await list.toggle(1)
      await list.toggle(2)
      await list.toggle(1)

      expect(list.items.map((i) => i.checked)).toEqual([false, true])
      expect(list.openCount).toBe(1)
      expect(requestsOf(fetch, 'PATCH')).toHaveLength(0)
      expect(JSON.parse(localStorage.getItem(QUEUE_KEY))).toEqual([
        { item_id: 2, checked: true, at: expect.any(String) },
        { item_id: 1, checked: false, at: expect.any(String) },
      ])
    })

    it('toont na herladen de snapshot met de offline wijzigingen erover', async () => {
      fakeServer({ shopping: [BLOEM, ZOUT] })
      const before = await loadedStore()
      goOffline()
      await before.toggle(2)

      const list = freshStore()
      await list.load()

      expect(list.items.map((i) => i.checked)).toEqual([false, true])
    })

    it('verstuurt de wachtrij weer online, en haalt daarna de lijst op', async () => {
      const { fetch, shoppingDb } = fakeServer({ shopping: [BLOEM, ZOUT, MELK] })
      const list = await loadedStore()
      goOffline()
      await list.toggle(1)
      await list.toggle(3)
      await list.toggle(1)
      await list.toggle(2)

      goOnline()
      fetch.mockClear()
      await list.load()

      expect(patchesOf(fetch)).toEqual([
        ['/api/shopping_list_items/3', { shopping_list_item: { checked: false } }],
        ['/api/shopping_list_items/1', { shopping_list_item: { checked: false } }],
        ['/api/shopping_list_items/2', { shopping_list_item: { checked: true } }],
      ])
      // Eerst de wachtrij, dan de lijst.
      expect(fetch.mock.calls.at(-1)[1].method).toBeUndefined()
      expect(shoppingDb.map((i) => i.checked)).toEqual([false, true, false])
      expect(list.items.map((i) => i.checked)).toEqual([false, true, false])
      expect(list.offline).toBe(false)
      expect(localStorage.getItem(QUEUE_KEY)).toBe('[]')
    })

    it('slaat een regel die intussen verwijderd is (404) over', async () => {
      const { shoppingDb } = fakeServer({ shopping: [BLOEM, ZOUT] })
      const list = await loadedStore()
      goOffline()
      await list.toggle(1)
      await list.toggle(2)
      shoppingDb.splice(0, 1)

      goOnline()
      await list.load()

      expect(list.items.map((i) => [i.name, i.checked])).toEqual([['zout', true]])
      expect(JSON.parse(localStorage.getItem(QUEUE_KEY))).toEqual([])
    })

    it('houdt de wachtrij en de offline stand als de server weer stuk is', async () => {
      fakeServer({ shopping: [BLOEM] })
      const list = await loadedStore()
      goOffline()
      await list.toggle(1)

      goOnline()
      // Afvinken mislukt (500), de lijst ophalen lukt wel, met de oude stand.
      mockFetch((method) =>
        method === 'PATCH' ? jsonResponse({}, 500) : jsonResponse([{ ...BLOEM, checked: false }]),
      )
      await list.load()

      expect(list.items[0].checked).toBe(true)
      expect(JSON.parse(localStorage.getItem(QUEUE_KEY))).toHaveLength(1)
    })

    it('stuurt een oudere offline actie niet meer als je online opnieuw afvinkt', async () => {
      const { fetch, shoppingDb } = fakeServer({ shopping: [BLOEM] })
      const list = await loadedStore()
      goOffline()
      await list.toggle(1)

      goOnline()
      list.offline = false
      await list.toggle(1)
      await list.load()

      expect(patchesOf(fetch)).toEqual([
        ['/api/shopping_list_items/1', { shopping_list_item: { checked: false } }],
      ])
      expect(shoppingDb[0].checked).toBe(false)
    })

    it('werkt zonder localStorage: alles blijft in het geheugen tot herladen', async () => {
      for (const method of ['getItem', 'setItem', 'removeItem']) {
        vi.spyOn(Storage.prototype, method).mockImplementation(() => {
          throw new DOMException('Opslag uitgezet', 'SecurityError')
        })
      }
      const { shoppingDb } = fakeServer({ shopping: [BLOEM, ZOUT] })
      const list = await loadedStore()
      goOffline()

      await list.toggle(1)
      expect(list.items[0].checked).toBe(true)

      goOnline()
      await list.load()
      expect(shoppingDb[0].checked).toBe(true)
      expect(list.offline).toBe(false)
    })
  })
})
