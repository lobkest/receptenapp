import { defineStore } from 'pinia'
import * as api from '@/api/standardItems'
import { useShoppingListStore } from '@/stores/shoppingList'
import { byName, groupByCategory } from '@/utils/grouping'

// Herkomst op de boodschappenlijst ("uit: standaard"), zonder recept.
export const STANDARD_SOURCE = { label: 'standaard', recipeId: null }

// De vaste boodschappen, via de openbare API: iedereen met de link ziet en wijzigt
// dezelfde lijst. Fouten (ApiError) gooien we door, zodat de pagina de melding kan tonen.
export const useStandardItemsStore = defineStore('standardItems', {
  state: () => ({
    items: [],
    loaded: false,
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
