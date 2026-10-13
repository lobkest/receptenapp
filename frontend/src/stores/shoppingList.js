import { defineStore } from 'pinia'
import { roundQuantity } from '@/utils/quantity'

// localStorage: blijft bewaard na sluiten van de browser, maar alleen in deze
// browser op dit apparaat. Prima voor een boodschappenlijst (niet geheim);
// niet voor de beheercode, die staat bewust in sessionStorage.
const STORAGE_KEY = 'shoppingList'

// Verhoog dit als de vorm van de opgeslagen data verandert, en zet oude data
// dan in readStoredItems om naar de nieuwe vorm.
const VERSION = 1

// "  Rode  Ui " → "rode ui". Bewust simpel: "ui" en "uien" blijven verschillend,
// en er is geen omrekening tussen eenheden (100 g ui ≠ 1 stuks ui).
export function normalizeName(name) {
  return String(name).trim().replace(/\s+/g, ' ').toLowerCase()
}

function itemKey(name, unit) {
  return `${normalizeName(name)}|${unit ?? ''}`
}

function isValidItem(item) {
  return (
    item !== null &&
    typeof item === 'object' &&
    typeof item.key === 'string' &&
    typeof item.name === 'string' &&
    (item.unit === null || typeof item.unit === 'string') &&
    (item.quantity === null || Number.isFinite(item.quantity)) &&
    typeof item.checked === 'boolean' &&
    Array.isArray(item.sources)
  )
}

// Leest de lijst uit localStorage. Alles wat kapot, onbekend of van een andere
// versie is, levert een lege lijst op in plaats van een crash. Losse ongeldige
// regels worden overgeslagen; de rest blijft staan.
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

// Zelfde naam (genormaliseerd) + zelfde eenheid → optellen; anders een nieuwe
// regel. "Naar smaak" (quantity null) heeft geen eenheid en wordt dus één regel
// per naam, zonder hoeveelheid. Past items ter plekke aan.
function mergeIngredient(items, { name, quantity, unit }, recipe) {
  const unitOrNull = quantity == null ? null : unit
  const key = itemKey(name, unitOrNull)
  let item = items.find((i) => i.key === key)

  if (!item) {
    item = {
      key,
      name: normalizeName(name),
      unit: unitOrNull,
      quantity: quantity == null ? null : 0,
      checked: false,
      sources: [],
    }
    items.push(item)
  }

  if (quantity != null) item.quantity = roundQuantity(item.quantity + quantity, unitOrNull)
  // Opnieuw nodig, dus niet meer afgevinkt.
  item.checked = false
  if (!item.sources.some((s) => s.id === recipe.id)) {
    item.sources.push({ id: recipe.id, title: recipe.title })
  }
}

// De boodschappenlijst. Elke actie die iets wijzigt, slaat daarna op.
export const useShoppingListStore = defineStore('shoppingList', {
  state: () => ({
    items: readStoredItems(),
  }),

  getters: {
    openCount: (state) => state.items.filter((item) => !item.checked).length,
    hasChecked: (state) => state.items.some((item) => item.checked),
  },

  actions: {
    persist() {
      storeItems(this.items)
    },

    // Voegt ingrediënten toe (al geschaald en afgerond) uit één recept.
    // ingredients: [{ name, quantity, unit }], recipe: { id, title }.
    addIngredients(ingredients, recipe) {
      for (const ingredient of ingredients) mergeIngredient(this.items, ingredient, recipe)
      this.persist()
    },

    add(ingredient, recipe) {
      this.addIngredients([ingredient], recipe)
    },

    toggle(key) {
      const item = this.items.find((i) => i.key === key)
      if (!item) return
      item.checked = !item.checked
      this.persist()
    },

    remove(key) {
      this.items = this.items.filter((i) => i.key !== key)
      this.persist()
    },

    clearChecked() {
      this.items = this.items.filter((i) => !i.checked)
      this.persist()
    },

    clearAll() {
      this.items = []
      this.persist()
    },
  },
})
