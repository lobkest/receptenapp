import { defineStore } from 'pinia'
import * as api from '@/api/standardItems'
import { normalizeName, useShoppingListStore } from '@/stores/shoppingList'
import { byName, groupByCategory } from '@/utils/grouping'

// Vroeger stond de standaardlijst in localStorage onder deze sleutel. Nu staat hij op
// de server; wat hier nog staat, kun je één keer importeren (importLegacy).
export const LEGACY_STORAGE_KEY = 'standardItems'

// Herkomst op de boodschappenlijst ("uit: standaard"), zonder recept.
export const STANDARD_SOURCE = { label: 'standaard', recipeId: null }

// De oude vorm was { version: 1, items: [{ id, name, quantity, unit, category }] }.
// Alleen naam en categorie gaan mee: de server kent geen hoeveelheid meer.
// Kapotte data levert een lege lijst op, en dan verschijnt de importknop gewoon niet.
function readLegacyItems() {
  try {
    const data = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY))
    if (!Array.isArray(data?.items)) return []
    return data.items
      .filter((item) => typeof item?.name === 'string' && item.name.trim())
      .map((item) => ({
        name: item.name,
        category: typeof item.category === 'string' ? item.category : null,
      }))
  } catch {
    return []
  }
}

function forgetLegacyItems() {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    // Geblokkeerde opslag: dan staat de knop er bij herladen weer; dubbele worden overgeslagen.
  }
}

// De vaste boodschappen, via de openbare API: iedereen met de link ziet en wijzigt
// dezelfde lijst. Fouten (ApiError) gooien we door, zodat de pagina de melding kan tonen.
export const useStandardItemsStore = defineStore('standardItems', {
  state: () => ({
    items: [],
    loaded: false,
    legacyItems: readLegacyItems(),
  }),

  getters: {
    // Per categorie op alfabet, "overig" (null) achteraan; binnen een groep op naam.
    groups: (state) => groupByCategory(state.items.toSorted(byName), (item) => item.category),

    // Voor de keuzelijst in het formulier: elke categorie één keer, op alfabet.
    categories: (state) =>
      [...new Set(state.items.map((item) => item.category).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, 'nl'),
      ),
  },

  actions: {
    async load() {
      this.items = await api.fetchStandardItems()
      this.loaded = true
    },

    // fields: { name, category }. De server normaliseert en geeft het nette item terug.
    async add(fields) {
      const item = await api.createStandardItem(fields)
      this.items.push(item)
      return item
    },

    async update(id, fields) {
      const item = await api.updateStandardItem(id, fields)
      this.items = this.items.map((i) => (i.id === id ? item : i))
      return item
    },

    async remove(id) {
      await api.deleteStandardItem(id)
      this.items = this.items.filter((i) => i.id !== id)
    },

    // Geeft het aantal verwijderde items terug.
    async removeMany(ids) {
      const { deleted_ids: deleted } = await api.bulkDeleteStandardItems(ids)
      this.items = this.items.filter((i) => !deleted.includes(i.id))
      return deleted.length
    },

    // Zet de oude lijst uit localStorage op de server. Namen die er al staan (ook twee keer
    // dezelfde in de oude lijst) slaan we over; wat de server weigert (bijv. te lang) ook.
    // Daarna is de oude sleutel weg. Gaat het halverwege mis (netwerk), dan blijft de
    // sleutel staan: opnieuw proberen slaat wat al geïmporteerd is gewoon over.
    async importLegacy() {
      const existing = new Set(this.items.map((item) => item.name))
      let imported = 0
      let skipped = 0

      for (const legacy of this.legacyItems) {
        if (existing.has(normalizeName(legacy.name))) {
          skipped++
          continue
        }
        try {
          const item = await this.add(legacy)
          existing.add(item.name)
          imported++
        } catch (e) {
          if (e.kind !== 'validation') throw e
          skipped++
        }
      }

      forgetLegacyItems()
      this.legacyItems = []
      return { imported, skipped }
    },

    // Op de gedeelde boodschappenlijst, in één request, zonder hoeveelheid: je moet het
    // gewoon kopen. Elk item wordt een eigen regel met herkomst "standaard", ook als
    // dezelfde naam er al staat. Geeft het aantal toegevoegde items terug.
    async addToShoppingList(ids) {
      const chosen = this.items.filter((i) => ids.includes(i.id))
      await useShoppingListStore().addIngredients(
        chosen.map(({ name }) => ({ name, quantity: null, unit: null })),
        STANDARD_SOURCE,
      )
      return chosen.length
    },
  },
})
