import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { LEGACY_STORAGE_KEY, useStandardItemsStore } from '../stores/standardItems'
import { useAdminStore } from '../stores/admin'
import { useShoppingListStore } from '../stores/shoppingList'
import { ADMIN_CODE, authHeaderOf, fakeStandardServer, jsonResponse, mockFetch } from './helpers'

const ITEMS = [
  { id: 1, name: 'melk', category: 'zuivel' },
  { id: 2, name: 'kaas', category: 'zuivel' },
  { id: 3, name: 'wc-papier', category: null },
  { id: 4, name: 'appels', category: 'groente & fruit' },
]

// Een nieuwe Pinia is als een herladen pagina: de stores lezen opnieuw uit de opslag.
function freshStore() {
  setActivePinia(createPinia())
  return useStandardItemsStore()
}

async function loadedStore() {
  const standard = freshStore()
  await standard.load()
  return standard
}

function storeLegacy(items) {
  localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ version: 1, items }))
}

function requestsOf(fetch, method) {
  return fetch.mock.calls.filter(([, options]) => (options.method ?? 'GET') === method)
}

describe('standaardboodschappen-store', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    sessionStorage.setItem('adminCode', ADMIN_CODE)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('begint leeg en niet geladen', () => {
    const standard = freshStore()

    expect(standard.items).toEqual([])
    expect(standard.loaded).toBe(false)
  })

  it('laadt de items met de beheercode in de Authorization-header', async () => {
    const { fetch } = fakeStandardServer(ITEMS)
    const standard = await loadedStore()

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][0]).toBe('/api/admin/standard_items')
    expect(authHeaderOf(fetch.mock.calls[0])).toBe(`Bearer ${ADMIN_CODE}`)
    expect(standard.items.map((i) => i.name)).toEqual(['appels', 'kaas', 'melk', 'wc-papier'])
    expect(standard.loaded).toBe(true)
  })

  it('logt uit en gooit de fout door bij een 401', async () => {
    mockFetch(() => jsonResponse({ error: 'Unauthorized' }, 401))
    const standard = freshStore()

    await expect(standard.load()).rejects.toMatchObject({ kind: 'unauthorized' })
    expect(useAdminStore().isLoggedIn).toBe(false)
    expect(standard.loaded).toBe(false)
  })

  it('voegt toe: stuurt naam en categorie, en bewaart het genormaliseerde item van de server', async () => {
    const { fetch, db } = fakeStandardServer(ITEMS)
    const standard = await loadedStore()

    const item = await standard.add({ name: ' Banaan ', category: 'Groente & Fruit' })

    const [, options] = requestsOf(fetch, 'POST')[0]
    expect(JSON.parse(options.body)).toEqual({
      standard_item: { name: ' Banaan ', category: 'Groente & Fruit' },
    })
    expect(item).toEqual({ id: 5, name: 'banaan', category: 'groente & fruit' })
    expect(standard.items).toContainEqual(item)
    expect(db).toContainEqual(item)
  })

  it('gooit een validatiefout door en laat de lijst ongemoeid', async () => {
    fakeStandardServer(ITEMS)
    const standard = await loadedStore()

    await expect(standard.add({ name: 'MELK', category: null })).rejects.toMatchObject({
      kind: 'validation',
      errors: { name: ['is al in gebruik'] },
    })
    expect(standard.items).toHaveLength(4)
  })

  it('werkt een item bij', async () => {
    const { fetch } = fakeStandardServer(ITEMS)
    const standard = await loadedStore()

    await standard.update(3, { name: 'WC-papier', category: 'huishouden' })

    expect(requestsOf(fetch, 'PATCH')[0][0]).toBe('/api/admin/standard_items/3')
    expect(standard.items.find((i) => i.id === 3)).toEqual({
      id: 3,
      name: 'wc-papier',
      category: 'huishouden',
    })
  })

  it('verwijdert één item', async () => {
    const { fetch } = fakeStandardServer(ITEMS)
    const standard = await loadedStore()

    await standard.remove(2)

    expect(requestsOf(fetch, 'DELETE')[0][0]).toBe('/api/admin/standard_items/2')
    expect(standard.items.map((i) => i.id)).not.toContain(2)
    expect(standard.items).toHaveLength(3)
  })

  it('verwijdert meerdere items in één request (bulk_destroy)', async () => {
    const { fetch, db } = fakeStandardServer(ITEMS)
    const standard = await loadedStore()

    const count = await standard.removeMany([1, 3])

    const posts = requestsOf(fetch, 'POST')
    expect(posts).toHaveLength(1)
    expect(posts[0][0]).toBe('/api/admin/standard_items/bulk_destroy')
    expect(JSON.parse(posts[0][1].body)).toEqual({ ids: [1, 3] })
    expect(count).toBe(2)
    expect(standard.items.map((i) => i.id).sort()).toEqual([2, 4])
    expect(db.map((i) => i.id).sort()).toEqual([2, 4])
  })

  it('haalt bij bulk alleen weg wat de server echt verwijderde', async () => {
    mockFetch((method, url) =>
      url.endsWith('bulk_destroy') ? jsonResponse({ deleted_ids: [1] }) : jsonResponse(ITEMS),
    )
    const standard = await loadedStore()

    expect(await standard.removeMany([1, 99])).toBe(1)
    expect(standard.items).toHaveLength(3)
  })

  it('groepeert per categorie op alfabet, overig achteraan, binnen een groep op naam', async () => {
    fakeStandardServer(ITEMS)
    const standard = await loadedStore()

    expect(standard.groups.map((g) => [g.category, g.items.map((i) => i.name)])).toEqual([
      ['groente & fruit', ['appels']],
      ['zuivel', ['kaas', 'melk']],
      [null, ['wc-papier']],
    ])
  })

  it('geeft de bestaande categorieën uniek en gesorteerd, zonder "geen categorie"', async () => {
    fakeStandardServer([...ITEMS, { id: 5, name: 'brood', category: 'bakker' }])
    const standard = await loadedStore()

    expect(standard.categories).toEqual(['bakker', 'groente & fruit', 'zuivel'])
  })

  describe('op de boodschappenlijst', () => {
    it('zet items erop zonder hoeveelheid, met herkomst "standaard"', async () => {
      fakeStandardServer(ITEMS)
      const standard = await loadedStore()

      expect(standard.addToShoppingList([1, 3])).toBe(2)

      const list = useShoppingListStore()
      expect(list.items.map((i) => [i.name, i.quantity, i.unit])).toEqual([
        ['melk', null, null],
        ['wc-papier', null, null],
      ])
      expect(list.items[0].sources).toEqual([{ id: 'standaard', title: 'standaard' }])
      // Blijft in localStorage, net als de rest van de boodschappenlijst.
      expect(JSON.parse(localStorage.getItem('shoppingList')).items).toHaveLength(2)
    })

    it('voegt samen met een "naar smaak"-regel met dezelfde naam uit een recept', async () => {
      fakeStandardServer(ITEMS)
      const standard = await loadedStore()
      useShoppingListStore().add(
        { name: 'melk', quantity: null, unit: null },
        { id: 7, title: 'Pap' },
      )

      standard.addToShoppingList([1])

      const [melk] = useShoppingListStore().items
      expect(useShoppingListStore().items).toHaveLength(1)
      expect(melk.sources.map((s) => s.title)).toEqual(['Pap', 'standaard'])
    })
  })

  describe('import van de oude lijst uit localStorage', () => {
    const LEGACY = [
      { id: 1, name: 'melk', quantity: 1000, unit: 'ml', category: 'zuivel' },
      { id: 2, name: 'Bananen', quantity: 6, unit: 'stuks', category: 'groente & fruit' },
      { id: 3, name: 'bananen ', quantity: null, unit: null, category: null },
      { id: 4, name: 'afwasmiddel', quantity: null, unit: null, category: null },
    ]

    it('leest naam en categorie uit de oude sleutel; hoeveelheid en eenheid vervallen', () => {
      storeLegacy(LEGACY)

      expect(freshStore().legacyItems).toEqual([
        { name: 'melk', category: 'zuivel' },
        { name: 'Bananen', category: 'groente & fruit' },
        { name: 'bananen ', category: null },
        { name: 'afwasmiddel', category: null },
      ])
    })

    it('negeert kapotte of lege oude data', () => {
      localStorage.setItem(LEGACY_STORAGE_KEY, '{kapot')
      expect(freshStore().legacyItems).toEqual([])

      storeLegacy([{ name: '  ' }, null, { name: 42 }])
      expect(freshStore().legacyItems).toEqual([])
    })

    it('importeert naar de API, slaat dubbele over en wist daarna de oude sleutel', async () => {
      storeLegacy(LEGACY)
      const { fetch, db } = fakeStandardServer(ITEMS)
      const standard = await loadedStore()

      const result = await standard.importLegacy()

      // melk staat al op de server; "bananen " is dezelfde als "Bananen".
      expect(result).toEqual({ imported: 2, skipped: 2 })
      expect(requestsOf(fetch, 'POST')).toHaveLength(2)
      expect(db.map((i) => i.name)).toEqual(
        expect.arrayContaining(['bananen', 'afwasmiddel', 'melk']),
      )
      expect(db).toHaveLength(6)
      expect(standard.items).toHaveLength(6)
      expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull()
      expect(standard.legacyItems).toEqual([])
    })

    it('telt een weigering van de server als overgeslagen', async () => {
      storeLegacy([{ name: 'kaas' }, { name: 'brood' }])
      // De server kent "kaas" al, maar de store weet dat nog niet (lijst niet geladen).
      fakeStandardServer([{ id: 1, name: 'kaas' }])
      const standard = freshStore()

      expect(await standard.importLegacy()).toEqual({ imported: 1, skipped: 1 })
    })

    it('houdt de oude sleutel als het halverwege misgaat', async () => {
      storeLegacy(LEGACY)
      mockFetch((method) =>
        method === 'POST' ? Promise.reject(new TypeError('offline')) : jsonResponse([]),
      )
      const standard = await loadedStore()

      await expect(standard.importLegacy()).rejects.toMatchObject({ kind: 'network' })
      expect(localStorage.getItem(LEGACY_STORAGE_KEY)).not.toBeNull()
      expect(standard.legacyItems).toHaveLength(4)
    })
  })
})
