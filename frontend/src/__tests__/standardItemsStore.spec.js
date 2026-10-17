import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useStandardItemsStore } from '../stores/standardItems'
import { useShoppingListStore } from '../stores/shoppingList'
import { fakeServer, fakeStandardServer, jsonResponse, mockFetch } from './helpers'

const ITEMS = [
  { id: 1, name: 'melk', category: 'zuivel' },
  { id: 2, name: 'kaas', category: 'zuivel' },
  { id: 3, name: 'wc-papier', category: null },
  { id: 4, name: 'appels', category: 'groente & fruit' },
]

// Een nieuwe Pinia is als een herladen pagina: de store begint leeg en haalt de lijst op.
function freshStore() {
  setActivePinia(createPinia())
  return useStandardItemsStore()
}

async function loadedStore() {
  const standard = freshStore()
  await standard.load()
  return standard
}

function requestsOf(fetch, method) {
  return fetch.mock.calls.filter(([, options]) => (options.method ?? 'GET') === method)
}

describe('standaardboodschappen-store', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
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

  it('laadt de items van de openbare API, zonder beheercode', async () => {
    const { fetch } = fakeStandardServer(ITEMS)
    const standard = await loadedStore()

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][0]).toBe('/api/standard_items')
    expect(fetch.mock.calls[0][1].headers?.Authorization).toBeUndefined()
    expect(standard.items.map((i) => i.name)).toEqual(['appels', 'kaas', 'melk', 'wc-papier'])
    expect(standard.loaded).toBe(true)
  })

  it('gooit een fout bij laden door en blijft dan niet-geladen', async () => {
    mockFetch(() => jsonResponse({}, 500))
    const standard = freshStore()

    await expect(standard.load()).rejects.toMatchObject({ kind: 'server' })
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

    expect(requestsOf(fetch, 'PATCH')[0][0]).toBe('/api/standard_items/3')
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

    expect(requestsOf(fetch, 'DELETE')[0][0]).toBe('/api/standard_items/2')
    expect(standard.items.map((i) => i.id)).not.toContain(2)
    expect(standard.items).toHaveLength(3)
  })

  it('verwijdert meerdere items in één request (bulk_destroy)', async () => {
    const { fetch, db } = fakeStandardServer(ITEMS)
    const standard = await loadedStore()

    const count = await standard.removeMany([1, 3])

    const posts = requestsOf(fetch, 'POST')
    expect(posts).toHaveLength(1)
    expect(posts[0][0]).toBe('/api/standard_items/bulk_destroy')
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
    it('zet items in één request op de gedeelde lijst, zonder hoeveelheid, met herkomst "standaard"', async () => {
      const { fetch, shoppingDb } = fakeStandardServer(ITEMS)
      const standard = await loadedStore()

      expect(await standard.addToShoppingList([1, 3])).toBe(2)

      const posts = requestsOf(fetch, 'POST')
      expect(posts.map(([url]) => url)).toEqual(['/api/standard_items/add_to_shopping_list'])
      expect(JSON.parse(posts[0][1].body)).toEqual({ ids: [1, 3] })
      expect(shoppingDb.map((i) => [i.name, i.quantity, i.source_label, i.standard_count])).toEqual(
        [
          ['melk', null, 'standaard', 1],
          ['wc-papier', null, 'standaard', 1],
        ],
      )
      expect(useShoppingListStore().items).toHaveLength(2)
    })

    it('staat het er al op (uit een recept), dan komt er één bij op die regel', async () => {
      const { shoppingDb } = fakeServer({
        standard: ITEMS,
        shopping: [
          { id: 7, name: 'melk', quantity: 200, unit: 'ml', source_label: 'Pap', recipe_id: 7 },
        ],
      })
      const standard = await loadedStore()
      await useShoppingListStore().load()

      await standard.addToShoppingList([1])

      expect(shoppingDb).toHaveLength(1)
      expect(
        useShoppingListStore().items.map((i) => [
          i.id,
          i.quantity,
          i.source_label,
          i.standard_count,
        ]),
      ).toEqual([[7, 200, 'Pap', 1]])
    })

    it('doet geen request zonder (bestaande) items', async () => {
      const { fetch } = fakeStandardServer(ITEMS)
      const standard = await loadedStore()

      expect(await standard.addToShoppingList([99])).toBe(0)
      expect(requestsOf(fetch, 'POST')).toHaveLength(0)
    })

    it('gooit een fout door als de server weigert', async () => {
      fakeStandardServer(ITEMS)
      const standard = await loadedStore()
      mockFetch(() => jsonResponse({}, 429))

      await expect(standard.addToShoppingList([1])).rejects.toMatchObject({ kind: 'rate_limited' })
    })
  })
})
