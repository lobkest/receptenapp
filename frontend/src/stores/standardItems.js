import { defineStore } from 'pinia'
import { normalizeName, useShoppingListStore } from '@/stores/shoppingList'
import { byName, groupByCategory } from '@/utils/grouping'
import { UNITS, roundQuantity } from '@/utils/quantity'

// Zelfde aanpak als de boodschappenlijst: localStorage, met een versienummer,
// en kapotte of onbekende data levert een lege lijst op in plaats van een crash.
const STORAGE_KEY = 'standardItems'

// Verhoog dit als de vorm van de opgeslagen data verandert, en zet oude data
// dan in readStoredItems om naar de nieuwe vorm.
const VERSION = 1

// Herkomst op de boodschappenlijst ("uit: standaard"). Recepten hebben een getal
// als id, dus deze tekst kan nooit met een recept botsen.
export const STANDARD_SOURCE = { id: 'standaard', title: 'standaard' }

// Alleen suggesties in het formulier; je mag ook een eigen categorie typen.
export const CATEGORY_SUGGESTIONS = [
  'zuivel',
  'groente & fruit',
  'brood',
  'vlees & vis',
  'voorraad',
  'diepvries',
  'drinken',
  'huishouden',
  'verzorging',
]

export const EXAMPLE_ITEMS = [
  { name: 'melk', quantity: 1000, unit: 'ml', category: 'zuivel' },
  { name: 'yoghurt', quantity: 500, unit: 'ml', category: 'zuivel' },
  { name: 'kaas', quantity: 400, unit: 'g', category: 'zuivel' },
  { name: 'eieren', quantity: 6, unit: 'stuks', category: 'zuivel' },
  { name: 'brood', quantity: 1, unit: 'stuks', category: 'brood' },
  { name: 'bananen', quantity: 6, unit: 'stuks', category: 'groente & fruit' },
  { name: 'appels', quantity: 4, unit: 'stuks', category: 'groente & fruit' },
  { name: 'tomaten', quantity: 500, unit: 'g', category: 'groente & fruit' },
  { name: 'pasta', quantity: 500, unit: 'g', category: 'voorraad' },
  { name: 'koffie', quantity: 500, unit: 'g', category: 'voorraad' },
  { name: 'wc-papier', quantity: null, unit: null, category: 'huishouden' },
  { name: 'afwasmiddel', quantity: null, unit: null, category: 'huishouden' },
]

// Maakt van formuliervelden een net item, of null als het niet klopt.
// - naam verplicht; naam en categorie genormaliseerd ("  Zuivel " → "zuivel")
// - hoeveelheid leeg = geen hoeveelheid en geen eenheid; anders > 0 met een bekende eenheid
// - lege categorie = null (komt onder "overig")
export function cleanFields({ name, quantity, unit, category }) {
  const cleanName = normalizeName(name ?? '')
  if (!cleanName) return null

  const hasQuantity = quantity !== '' && quantity != null
  const number = hasQuantity ? Number(quantity) : null
  if (hasQuantity && !(Number.isFinite(number) && number > 0)) return null
  if (hasQuantity && !UNITS.includes(unit)) return null

  return {
    name: cleanName,
    quantity: hasQuantity ? roundQuantity(number, unit) : null,
    unit: hasQuantity ? unit : null,
    category: category ? normalizeName(category) || null : null,
  }
}

function isValidItem(item) {
  return (
    item !== null &&
    typeof item === 'object' &&
    Number.isInteger(item.id) &&
    typeof item.name === 'string' &&
    item.name !== '' &&
    (item.quantity === null
      ? item.unit === null
      : Number.isFinite(item.quantity) && item.quantity > 0 && UNITS.includes(item.unit)) &&
    (item.category === null || typeof item.category === 'string')
  )
}

function readStoredItems() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (data?.version !== VERSION || !Array.isArray(data.items)) return []
    return data.items.filter(isValidItem)
  } catch {
    return []
  }
}

function storeItems(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, items }))
  } catch {
    // Privémodus of opslag vol: dan werkt de lijst tot je herlaadt.
  }
}

// De vaste boodschappen. Elke actie die iets wijzigt, slaat daarna op.
export const useStandardItemsStore = defineStore('standardItems', {
  state: () => ({
    items: readStoredItems(),
  }),

  getters: {
    // Per categorie op alfabet, "overig" (null) achteraan; binnen een groep op naam.
    groups: (state) => groupByCategory(state.items.toSorted(byName), (item) => item.category),
  },

  actions: {
    persist() {
      storeItems(this.items)
    },

    // Geeft het nieuwe item terug, of null als de velden niet kloppen.
    add(fields) {
      const clean = cleanFields(fields)
      if (!clean) return null
      // Een oplopend getal is genoeg; crypto.randomUUID() werkt alleen via https.
      const id = Math.max(0, ...this.items.map((i) => i.id)) + 1
      const item = { id, ...clean }
      this.items.push(item)
      this.persist()
      return item
    },

    // true als het gelukt is.
    update(id, fields) {
      const clean = cleanFields(fields)
      const item = this.items.find((i) => i.id === id)
      if (!clean || !item) return false
      Object.assign(item, clean)
      this.persist()
      return true
    },

    remove(id) {
      this.items = this.items.filter((i) => i.id !== id)
      this.persist()
    },

    // Alleen voor een lege lijst, zodat je nooit per ongeluk dubbele items krijgt.
    loadExample() {
      if (this.items.length) return
      for (const example of EXAMPLE_ITEMS) this.add(example)
    },

    // Zet items op de boodschappenlijst met de bestaande samenvoeglogica:
    // 1000 ml melk + 200 ml melk uit een recept = 1200 ml, "uit: …, standaard".
    // Geeft het aantal toegevoegde items terug.
    addToShoppingList(ids) {
      const chosen = this.items.filter((i) => ids.includes(i.id))
      useShoppingListStore().addIngredients(
        chosen.map(({ name, quantity, unit }) => ({ name, quantity, unit })),
        STANDARD_SOURCE,
      )
      return chosen.length
    },
  },
})
