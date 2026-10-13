import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { EXAMPLE_ITEMS, cleanFields, useStandardItemsStore } from '../stores/standardItems'
import { useShoppingListStore } from '../stores/shoppingList'

// Een nieuwe Pinia is als een herladen pagina: de store leest opnieuw uit localStorage.
function freshStore() {
  setActivePinia(createPinia())
  return useStandardItemsStore()
}

function stored() {
  return JSON.parse(localStorage.getItem('standardItems'))
}

const MILK = { name: 'Melk', quantity: '1000', unit: 'ml', category: ' Zuivel ' }

describe('standaardboodschappen-store', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('begint leeg', () => {
    expect(freshStore().items).toEqual([])
  })

  describe('toevoegen', () => {
    it('normaliseert naam en categorie en maakt van de hoeveelheid een getal', () => {
      const standard = freshStore()
      const item = standard.add(MILK)

      expect(item).toEqual({ id: 1, name: 'melk', quantity: 1000, unit: 'ml', category: 'zuivel' })
      expect(standard.items).toEqual([item])
    })

    it('zonder hoeveelheid vervalt ook de eenheid; lege categorie wordt null', () => {
      const item = freshStore().add({ name: 'wc-papier', quantity: '', unit: 'g', category: '  ' })

      expect(item).toMatchObject({ quantity: null, unit: null, category: null })
    })

    it('geeft elk item een eigen, oplopend id', () => {
      const standard = freshStore()
      standard.add({ name: 'melk' })
      standard.add({ name: 'kaas' })
      standard.remove(1)
      standard.add({ name: 'brood' })

      expect(standard.items.map((i) => i.id)).toEqual([2, 3])
    })

    it.each([
      ['zonder naam', { name: '   ' }],
      ['met hoeveelheid 0', { name: 'melk', quantity: 0, unit: 'ml' }],
      ['met negatieve hoeveelheid', { name: 'melk', quantity: -1, unit: 'ml' }],
      ['met onbekende eenheid', { name: 'melk', quantity: 1, unit: 'liter' }],
    ])('weigert een item %s', (_, fields) => {
      const standard = freshStore()

      expect(standard.add(fields)).toBeNull()
      expect(standard.items).toEqual([])
    })

    it('rondt de hoeveelheid af zoals de boodschappenlijst', () => {
      expect(cleanFields({ name: 'eieren', quantity: 1.3, unit: 'stuks' }).quantity).toBe(1.5)
    })
  })

  it('bewerkt een item, maar niet met ongeldige velden', () => {
    const standard = freshStore()
    standard.add(MILK)

    expect(standard.update(1, { name: 'Havermelk', quantity: '', category: '' })).toBe(true)
    expect(standard.items[0]).toEqual({
      id: 1,
      name: 'havermelk',
      quantity: null,
      unit: null,
      category: null,
    })

    expect(standard.update(1, { name: '' })).toBe(false)
    expect(standard.update(99, { name: 'kaas' })).toBe(false)
    expect(standard.items[0].name).toBe('havermelk')
  })

  it('groepeert per categorie op alfabet, overig achteraan, binnen een groep op naam', () => {
    const standard = freshStore()
    standard.add({ name: 'zeep', category: 'verzorging' })
    standard.add({ name: 'kaars' })
    standard.add({ name: 'yoghurt', category: 'zuivel' })
    standard.add({ name: 'kaas', category: 'zuivel' })
    standard.add({ name: 'appels', category: 'groente & fruit' })

    expect(standard.groups.map((g) => [g.category, g.items.map((i) => i.name)])).toEqual([
      ['groente & fruit', ['appels']],
      ['verzorging', ['zeep']],
      ['zuivel', ['kaas', 'yoghurt']],
      [null, ['kaars']],
    ])
  })

  describe('voorbeeldlijst', () => {
    it('laadt de voorbeelditems in een lege lijst', () => {
      const standard = freshStore()
      standard.loadExample()

      expect(standard.items).toHaveLength(EXAMPLE_ITEMS.length)
      expect(stored().items).toHaveLength(EXAMPLE_ITEMS.length)
    })

    it('doet niets als er al items zijn', () => {
      const standard = freshStore()
      standard.add({ name: 'melk' })
      standard.loadExample()

      expect(standard.items.map((i) => i.name)).toEqual(['melk'])
    })
  })

  describe('op de boodschappenlijst', () => {
    it('voegt toe met herkomst "standaard" en geeft het aantal terug', () => {
      const standard = freshStore()
      standard.add(MILK)
      standard.add({ name: 'wc-papier' })
      standard.add({ name: 'kaas', quantity: 400, unit: 'g' })

      expect(standard.addToShoppingList([1, 2])).toBe(2)

      const list = useShoppingListStore()
      expect(list.items.map((i) => [i.name, i.quantity, i.unit])).toEqual([
        ['melk', 1000, 'ml'],
        ['wc-papier', null, null],
      ])
      expect(list.items[0].sources).toEqual([{ id: 'standaard', title: 'standaard' }])
    })

    it('telt op bij dezelfde regel uit een recept', () => {
      const standard = freshStore()
      standard.add(MILK)
      const list = useShoppingListStore()
      list.add({ name: 'melk', quantity: 200, unit: 'ml' }, { id: 1, title: 'Pannenkoeken' })

      standard.addToShoppingList([1])

      expect(list.items).toHaveLength(1)
      expect(list.items[0].quantity).toBe(1200)
      expect(list.items[0].sources.map((s) => s.title)).toEqual(['Pannenkoeken', 'standaard'])
    })
  })

  describe('opslag', () => {
    it('slaat op met een versienummer en laadt na herladen terug', () => {
      freshStore().add(MILK)

      expect(stored().version).toBe(1)
      expect(freshStore().items.map((i) => i.name)).toEqual(['melk'])
    })

    it('slaat verwijderen en bewerken ook op', () => {
      const standard = freshStore()
      standard.add(MILK)
      standard.add({ name: 'kaas' })
      standard.update(2, { name: 'brie' })
      standard.remove(1)

      expect(freshStore().items.map((i) => i.name)).toEqual(['brie'])
    })

    it('begint leeg bij ongeldige JSON', () => {
      localStorage.setItem('standardItems', '{kapot')
      expect(freshStore().items).toEqual([])
    })

    it('begint leeg bij een onbekende versie', () => {
      localStorage.setItem('standardItems', JSON.stringify({ version: 99, items: [] }))
      expect(freshStore().items).toEqual([])
    })

    it('begint leeg als items geen lijst is', () => {
      localStorage.setItem('standardItems', JSON.stringify({ version: 1, items: 'nee' }))
      expect(freshStore().items).toEqual([])
    })

    it('slaat losse ongeldige items over en houdt de rest', () => {
      const good = { id: 1, name: 'melk', quantity: 1000, unit: 'ml', category: 'zuivel' }
      localStorage.setItem(
        'standardItems',
        JSON.stringify({
          version: 1,
          items: [
            good,
            null,
            { id: 2, name: '', quantity: null, unit: null, category: null },
            { id: 3, name: 'kaas', quantity: 400, unit: null, category: null },
            { id: 'x', name: 'brood', quantity: null, unit: null, category: null },
          ],
        }),
      )

      expect(freshStore().items).toEqual([good])
    })

    it('blijft werken als opslaan mislukt', () => {
      const standard = freshStore()
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })

      expect(() => standard.add(MILK)).not.toThrow()
      expect(standard.items).toHaveLength(1)
    })
  })
})
