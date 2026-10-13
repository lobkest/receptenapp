import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useShoppingListStore, normalizeName } from '../stores/shoppingList'

const PANCAKES = { id: 1, title: 'Pannenkoeken' }
const WAFFLES = { id: 2, title: 'Wafels' }

// Een nieuwe Pinia is als een herladen pagina: de store leest opnieuw uit localStorage.
function freshStore() {
  setActivePinia(createPinia())
  return useShoppingListStore()
}

function stored() {
  return JSON.parse(localStorage.getItem('shoppingList'))
}

describe('boodschappenlijst-store', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('samenvoegen', () => {
    it('telt zelfde naam en eenheid op en onthoudt beide recepten', () => {
      const list = freshStore()
      list.add({ name: 'Bloem', quantity: 200, unit: 'g' }, PANCAKES)
      list.add({ name: '  bloem ', quantity: 150, unit: 'g' }, WAFFLES)

      expect(list.items).toHaveLength(1)
      expect(list.items[0]).toMatchObject({ name: 'bloem', quantity: 350, unit: 'g' })
      expect(list.items[0].sources.map((s) => s.title)).toEqual(['Pannenkoeken', 'Wafels'])
    })

    it('maakt een aparte regel bij een andere eenheid', () => {
      const list = freshStore()
      list.add({ name: 'ui', quantity: 1, unit: 'stuks' }, PANCAKES)
      list.add({ name: 'ui', quantity: 100, unit: 'g' }, WAFFLES)

      expect(list.items.map((i) => [i.quantity, i.unit])).toEqual([
        [1, 'stuks'],
        [100, 'g'],
      ])
    })

    it('herkent geen meervoud: "ui" en "uien" blijven apart', () => {
      const list = freshStore()
      list.add({ name: 'ui', quantity: 1, unit: 'stuks' }, PANCAKES)
      list.add({ name: 'uien', quantity: 2, unit: 'stuks' }, WAFFLES)

      expect(list.items).toHaveLength(2)
    })

    it('zet "naar smaak" maar één keer op de lijst, zonder hoeveelheid', () => {
      const list = freshStore()
      list.add({ name: 'zout', quantity: null, unit: null }, PANCAKES)
      list.add({ name: 'Zout', quantity: null, unit: null }, WAFFLES)

      expect(list.items).toHaveLength(1)
      expect(list.items[0]).toMatchObject({ name: 'zout', quantity: null, unit: null })
      expect(list.items[0].sources).toHaveLength(2)
    })

    it('telt hetzelfde recept twee keer op, maar noemt het maar één keer als herkomst', () => {
      const list = freshStore()
      list.add({ name: 'ei', quantity: 1.5, unit: 'stuks' }, PANCAKES)
      list.add({ name: 'ei', quantity: 1.5, unit: 'stuks' }, PANCAKES)

      expect(list.items[0].quantity).toBe(3)
      expect(list.items[0].sources).toEqual([PANCAKES])
    })

    it('rondt de som af, zonder rekenfouten als 0,30000000000000004', () => {
      const list = freshStore()
      list.add({ name: 'gist', quantity: 0.1, unit: 'g' }, PANCAKES)
      list.add({ name: 'gist', quantity: 0.2, unit: 'g' }, WAFFLES)

      expect(list.items[0].quantity).toBe(0.3)
    })

    it('haalt het vinkje weg als je een afgevinkte regel opnieuw toevoegt', () => {
      const list = freshStore()
      list.add({ name: 'melk', quantity: 500, unit: 'ml' }, PANCAKES)
      list.toggle(list.items[0].key)
      list.add({ name: 'melk', quantity: 250, unit: 'ml' }, WAFFLES)

      expect(list.items[0].checked).toBe(false)
    })

    it('voegt een heel recept in één keer toe', () => {
      const list = freshStore()
      list.addIngredients(
        [
          { name: 'bloem', quantity: 250, unit: 'g' },
          { name: 'zout', quantity: null, unit: null },
        ],
        PANCAKES,
      )

      expect(list.items.map((i) => i.name)).toEqual(['bloem', 'zout'])
    })
  })

  it('normaliseert namen', () => {
    expect(normalizeName('  Rode   Ui ')).toBe('rode ui')
  })

  it('telt alleen niet-afgevinkte regels als open', () => {
    const list = freshStore()
    list.add({ name: 'bloem', quantity: 200, unit: 'g' }, PANCAKES)
    list.add({ name: 'melk', quantity: 500, unit: 'ml' }, PANCAKES)
    list.toggle(list.items[0].key)

    expect(list.openCount).toBe(1)
    expect(list.hasChecked).toBe(true)
  })

  it('verwijdert regels, afgevinkte regels en alles', () => {
    const list = freshStore()
    list.add({ name: 'a', quantity: 1, unit: 'stuks' }, PANCAKES)
    list.add({ name: 'b', quantity: 1, unit: 'stuks' }, PANCAKES)
    list.add({ name: 'c', quantity: 1, unit: 'stuks' }, PANCAKES)

    list.remove('a|stuks')
    expect(list.items.map((i) => i.name)).toEqual(['b', 'c'])

    list.toggle('b|stuks')
    list.clearChecked()
    expect(list.items.map((i) => i.name)).toEqual(['c'])

    list.clearAll()
    expect(list.items).toEqual([])
    expect(stored().items).toEqual([])
  })

  describe('localStorage', () => {
    it('slaat op met een versienummer en laadt na herladen terug', () => {
      const list = freshStore()
      list.add({ name: 'bloem', quantity: 200, unit: 'g' }, PANCAKES)
      list.toggle('bloem|g')

      expect(stored().version).toBe(1)

      const reloaded = freshStore()
      expect(reloaded.items).toEqual([
        {
          key: 'bloem|g',
          name: 'bloem',
          unit: 'g',
          quantity: 200,
          checked: true,
          sources: [PANCAKES],
        },
      ])
    })

    it('begint leeg bij ongeldige JSON', () => {
      localStorage.setItem('shoppingList', '{kapot')
      expect(freshStore().items).toEqual([])
    })

    it('begint leeg bij een onbekende versie', () => {
      localStorage.setItem('shoppingList', JSON.stringify({ version: 99, items: [] }))
      expect(freshStore().items).toEqual([])
    })

    it('begint leeg als items geen lijst is', () => {
      localStorage.setItem('shoppingList', JSON.stringify({ version: 1, items: 'nee' }))
      expect(freshStore().items).toEqual([])
    })

    it('begint leeg bij oude data zonder versie', () => {
      localStorage.setItem('shoppingList', JSON.stringify(['bloem', 'melk']))
      expect(freshStore().items).toEqual([])
    })

    it('slaat losse ongeldige regels over en houdt de rest', () => {
      const good = {
        key: 'melk|ml',
        name: 'melk',
        unit: 'ml',
        quantity: 500,
        checked: false,
        sources: [],
      }
      localStorage.setItem(
        'shoppingList',
        JSON.stringify({ version: 1, items: [good, null, { name: 'half' }, 'tekst'] }),
      )

      expect(freshStore().items).toEqual([good])
    })

    it('blijft werken als opslaan mislukt', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })
      const list = freshStore()
      list.add({ name: 'bloem', quantity: 200, unit: 'g' }, PANCAKES)

      expect(list.items).toHaveLength(1)
    })
  })
})
