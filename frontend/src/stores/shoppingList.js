import { defineStore } from 'pinia'
import * as api from '@/api/shoppingList'

// De boodschappenlijst staat op de server: één gedeelde lijst voor iedereen met de link,
// op elk apparaat dezelfde. Deze store praat alleen met de API. Regels worden nooit
// samengevoegd: twee keer bloem (uit twee recepten) zijn twee regels, elk met eigen herkomst.

// Vroeger stond de lijst in localStorage onder deze sleutel. Wat daar nog staat, kun je
// één keer importeren (importLegacy); daarna wissen we de sleutel.
export const LEGACY_STORAGE_KEY = 'shoppingList'
const LEGACY_VERSION = 1

// Zoveel regels neemt de server per request aan (MAX_ITEMS_PER_REQUEST).
const MAX_PER_REQUEST = 100
// Langere namen weigert de server (ShoppingListItem::MAX_LENGTH); die slaan we bij de import over.
const MAX_NAME_LENGTH = 100

// "  Rode  Ui " → "rode ui", net als de server.
export function normalizeName(name) {
  return String(name).trim().replace(/\s+/g, ' ').toLowerCase()
}

// De oude vorm was { version: 1, items: [{ key, name, quantity, unit, checked, sources }] },
// met sources: [{ id, title }]. De recept-id's sturen we niet mee: dat recept kan
// inmiddels verwijderd zijn, en dan zou de server de hele import weigeren. De titels
// blijven wel staan als herkomst. Kapotte data levert een lege lijst op, en dan
// verschijnt de importknop gewoon niet.
function readLegacyItems() {
  try {
    const data = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY))
    if (data?.version !== LEGACY_VERSION || !Array.isArray(data.items)) return []
    return data.items
      .filter(
        (item) =>
          typeof item?.name === 'string' &&
          item.name.trim() &&
          item.name.trim().length <= MAX_NAME_LENGTH &&
          (item.quantity == null || Number.isFinite(item.quantity)),
      )
      .map((item) => {
        const hasQuantity = item.quantity != null && typeof item.unit === 'string'
        const titles = Array.isArray(item.sources)
          ? item.sources.map((source) => source?.title).filter((t) => typeof t === 'string')
          : []
        return {
          name: item.name,
          quantity: hasQuantity ? item.quantity : null,
          unit: hasQuantity ? item.unit : null,
          source_label: titles.join(', ') || null,
          checked: item.checked === true,
        }
      })
  } catch {
    return []
  }
}

function forgetLegacyItems() {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    // Geblokkeerde opslag: dan staat de knop er bij herladen weer.
  }
}

function chunks(list, size) {
  const result = []
  for (let i = 0; i < list.length; i += size) result.push(list.slice(i, i + size))
  return result
}

// Een lopende load(), zodat App en de pagina die tegelijk aanroepen maar één request doen.
let pendingLoad = null

export const useShoppingListStore = defineStore('shoppingList', {
  state: () => ({
    // Zoals de server ze stuurt: { id, name, quantity, unit, source_label, recipe_id, checked }.
    items: [],
    loaded: false,
    legacyItems: readLegacyItems(),
    // Telt elke lokale wijziging, en hoeveel daarvan nog onderweg zijn. Zie load().
    changes: 0,
    inFlight: 0,
  }),

  getters: {
    openCount: (state) => state.items.filter((item) => !item.checked).length,
    hasChecked: (state) => state.items.some((item) => item.checked),
  },

  actions: {
    // Haalt de hele lijst op. Is er intussen hier iets afgevinkt (of is dat nog onderweg),
    // dan kan het antwoord ouder zijn dan wat je ziet; dan houden we de eigen stand en
    // haalt de volgende verversing de rest op. Fouten (ApiError) gooien we door.
    load() {
      if (pendingLoad) return pendingLoad
      const changesBefore = this.changes
      pendingLoad = api
        .fetchShoppingList()
        .then((items) => {
          if (this.changes === changesBefore && this.inFlight === 0) this.items = items
          this.loaded = true
        })
        .finally(() => (pendingLoad = null))
      return pendingLoad
    },

    // Voegt ingrediënten toe (al geschaald en afgerond), in één request. Elk ingrediënt
    // wordt een nieuwe regel achteraan, ook als dezelfde naam er al staat.
    // ingredients: [{ name, quantity, unit }], source: { label, recipeId }.
    // "Naar smaak" (quantity null) gaat zonder eenheid.
    async addIngredients(ingredients, { label = null, recipeId = null } = {}) {
      if (ingredients.length === 0) return
      const payload = ingredients.map(({ name, quantity, unit }) => ({
        name,
        quantity: quantity ?? null,
        unit: quantity == null ? null : unit,
        source_label: label,
        recipe_id: recipeId,
      }))
      this.changes++
      this.items.push(...(await api.addShoppingListItems(payload)))
    },

    add(ingredient, source) {
      return this.addIngredients([ingredient], source)
    },

    // Optimistisch: het vinkje staat er meteen, het request volgt. Mislukt het, dan
    // draaien we het terug en gooien we de fout door, zodat de pagina een melding toont.
    // Heeft iemand anders de regel al verwijderd, dan verdwijnt hij hier ook.
    async toggle(id) {
      const item = this.items.find((i) => i.id === id)
      if (!item) return
      const checked = !item.checked
      item.checked = checked
      this.changes++
      this.inFlight++
      try {
        await api.updateShoppingListItem(id, { checked })
      } catch (e) {
        if (e.kind === 'not_found') {
          this.items = this.items.filter((i) => i.id !== id)
        } else if (item.checked === checked) {
          item.checked = !checked
        }
        throw e
      } finally {
        this.inFlight--
      }
    },

    // Al door iemand anders verwijderd (404) is ook goed: weg is weg.
    async remove(id) {
      this.changes++
      try {
        await api.deleteShoppingListItem(id)
      } catch (e) {
        if (e.kind !== 'not_found') throw e
      }
      this.items = this.items.filter((i) => i.id !== id)
    },

    async clearChecked() {
      this.changes++
      await api.clearCheckedShoppingListItems()
      this.items = this.items.filter((i) => !i.checked)
    },

    async clearAll() {
      this.changes++
      await api.clearAllShoppingListItems()
      this.items = []
    },

    // Zet de oude lijst uit localStorage op de server, als nieuwe regels naast wat er al
    // staat. Elk request is alles of niets; gaat het mis, dan
    // blijft de sleutel staan en kun je het opnieuw proberen. (Alleen bij meer dan 100
    // regels kan een eerder deel dan al binnen zijn; zo'n lange lijst verwachten we niet.)
    // Geeft het aantal regels terug.
    async importLegacy() {
      const count = this.legacyItems.length
      for (const part of chunks(this.legacyItems, MAX_PER_REQUEST)) {
        this.changes++
        this.items.push(...(await api.addShoppingListItems(part)))
      }
      forgetLegacyItems()
      this.legacyItems = []
      return count
    },
  },
})
