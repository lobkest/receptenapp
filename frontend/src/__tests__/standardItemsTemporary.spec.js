import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import StandardItemForm from '../components/StandardItemForm.vue'
import { useSnapshotStore } from '../stores/snapshot'
import { useStandardItemsStore } from '../stores/standardItems'
import { clearMemoryStorage } from '../offline/storage'
import { expiryLimit, isExpired } from '../utils/temporaryItems'
import { fakeServer } from './helpers'

// "Tijdelijk" op de standaardlijst: losse items van de boodschappenlijst, die de server daar
// zet (StandardItem.note_used!). De browser groepeert ze als laatste, laat verlopen items uit
// de offline kopie weg en maakt ze permanent bij verplaatsen naar een categorie.

const NOW = new Date(2026, 10, 3, 12).getTime()
const DAY = 24 * 60 * 60 * 1000
const iso = (ms) => new Date(ms).toISOString()

const ITEMS = [
  { id: 1, name: 'melk', category: 'zuivel', temporary_last_used_at: null },
  { id: 2, name: 'wc-papier', category: null, temporary_last_used_at: null },
  { id: 3, name: 'dille', category: null, temporary_last_used_at: iso(NOW - 10 * DAY) },
  { id: 4, name: 'bieslook', category: null, temporary_last_used_at: iso(NOW - 70 * DAY) },
]

function freshStores() {
  setActivePinia(createPinia())
  return { standard: useStandardItemsStore(), snapshot: useSnapshotStore() }
}

function goOffline() {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
}

function patches(fetch) {
  return fetch.mock.calls
    .filter(([, options]) => options.method === 'PATCH')
    .map(([url, options]) => [url, JSON.parse(options.body)])
}

describe('Tijdelijk op de standaardlijst', () => {
  beforeEach(() => {
    localStorage.clear()
    clearMemoryStorage()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe('verlopen', () => {
    it('na 2 kalendermaanden, zoals Rails 2.months.ago', () => {
      const limit = expiryLimit(NOW)
      expect(isExpired({ temporary_last_used_at: iso(limit) }, NOW)).toBe(false)
      expect(isExpired({ temporary_last_used_at: iso(limit - 1) }, NOW)).toBe(true)
      expect(isExpired({ temporary_last_used_at: null }, NOW)).toBe(false)
    })

    it('op 30 april is de grens het eind van februari, niet 2 maart', () => {
      const limit = new Date(expiryLimit(new Date(2027, 3, 30, 12).getTime()))
      expect([limit.getMonth(), limit.getDate()]).toEqual([1, 28])
    })
  })

  it('zet Tijdelijk als laatste groep, na "overig", en niet bij de categorieën', async () => {
    fakeServer({ standard: ITEMS.slice(0, 3) })
    const { standard } = freshStores()
    await standard.load()

    const groups = standard.groups.map((g) => [g.temporary ?? false, g.category])
    expect(groups).toEqual([
      [false, 'zuivel'],
      [false, null],
      [true, null],
    ])
    expect(standard.groups.at(-1).items.map((i) => i.name)).toEqual(['dille'])
    expect(standard.categories).toEqual(['zuivel'])
  })

  it('laat een verlopen item uit de offline kopie weg', async () => {
    fakeServer({ standard: ITEMS })
    await freshStores().snapshot.load()

    goOffline()
    const { standard } = freshStores()
    await standard.load()

    expect(standard.offline).toBe(true)
    const names = standard.items.map((i) => i.name)
    expect(names).toContain('dille')
    expect(names).not.toContain('bieslook')
  })

  it('een categorie maakt een tijdelijk item permanent', async () => {
    const server = fakeServer({ standard: ITEMS.slice(0, 3) })
    const { standard } = freshStores()
    await standard.load()

    await standard.update(3, { name: 'dille', category: 'kruiden' })

    expect(standard.items.find((i) => i.id === 3).temporary_last_used_at).toBeNull()
    expect(server.standardDb.find((i) => i.id === 3).temporary_last_used_at).toBeNull()
    expect(standard.groups.some((g) => g.temporary)).toBe(false)
  })

  it('offline: een categorie maakt het item meteen permanent, alleen naam niet', async () => {
    fakeServer({ standard: ITEMS.slice(0, 3) })
    await freshStores().snapshot.load()
    goOffline()
    const { standard } = freshStores()
    await standard.load()

    await standard.update(3, { name: 'verse dille', category: null })
    expect(standard.items.find((i) => i.id === 3).temporary_last_used_at).not.toBeNull()

    await standard.update(3, { name: 'verse dille', category: 'kruiden' })
    expect(standard.items.find((i) => i.id === 3).temporary_last_used_at).toBeNull()
  })

  it('"Geen categorie" (temporary: false) gaat offline mee naar de server', async () => {
    const server = fakeServer({ standard: ITEMS.slice(0, 3) })
    await freshStores().snapshot.load()
    goOffline()
    const { standard } = freshStores()
    await standard.load()

    await standard.update(3, { name: 'dille', category: null, temporary: false })
    expect(standard.items.find((i) => i.id === 3).temporary_last_used_at).toBeNull()

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    await standard.load()
    expect(patches(server.fetch)).toEqual([
      [
        '/api/standard_items/3',
        { standard_item: { name: 'dille', category: null, temporary: false } },
      ],
    ])
    expect(server.standardDb.find((i) => i.id === 3).temporary_last_used_at).toBeNull()
  })

  it('weigert offline de categorie "Tijdelijk", zoals de server', async () => {
    fakeServer({ standard: ITEMS.slice(0, 3) })
    await freshStores().snapshot.load()
    goOffline()
    const { standard } = freshStores()
    await standard.load()

    await expect(
      standard.add({ name: 'peterselie', category: ' TIJDELIJK ' }),
    ).rejects.toMatchObject({
      kind: 'validation',
      errors: { category: [expect.stringContaining('Tijdelijk')] },
    })
  })

  describe('bewerkformulier', () => {
    const temporaryItem = ITEMS[2]

    function mountForm(initial) {
      return mount(StandardItemForm, { props: { initial, categories: ['zuivel'] } })
    }

    async function submit(wrapper) {
      await wrapper.find('form').trigger('submit')
      return wrapper.emitted('save').at(-1)[0]
    }

    it('een tijdelijk item begint met de keuze Tijdelijk en blijft dan tijdelijk', async () => {
      const wrapper = mountForm(temporaryItem)
      const select = wrapper.find('select.category')
      expect(select.element.selectedOptions[0].text).toBe('Tijdelijk')

      expect(await submit(wrapper)).toEqual({ name: 'dille', category: null })
    })

    it('"Geen categorie" of een categorie maakt het permanent', async () => {
      const wrapper = mountForm(temporaryItem)
      await wrapper.find('select.category').setValue('')
      expect(await submit(wrapper)).toEqual({ name: 'dille', category: null, temporary: false })

      await wrapper.find('select.category').setValue('zuivel')
      expect(await submit(wrapper)).toEqual({
        name: 'dille',
        category: 'zuivel',
        temporary: false,
      })
    })

    it('een permanent item heeft geen keuze Tijdelijk', () => {
      const texts = mountForm(ITEMS[0])
        .findAll('select.category option')
        .map((o) => o.text())
      expect(texts).not.toContain('Tijdelijk')
    })
  })
})
