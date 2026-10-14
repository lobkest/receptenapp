import { defineStore } from 'pinia'
import * as api from '@/api/shoppingList'
import { addVariationToShoppingList } from '@/api/variations'

// De boodschappenlijst staat op de server: één gedeelde lijst voor iedereen met de link,
// op elk apparaat dezelfde. Deze store praat alleen met de API. Regels worden nooit
// samengevoegd: twee keer bloem (uit twee recepten) zijn twee regels, elk met eigen herkomst.

// Een lopende load(), zodat App en de pagina die tegelijk aanroepen maar één request doen.
let pendingLoad = null

export const useShoppingListStore = defineStore('shoppingList', {
  state: () => ({
    // Zoals de server ze stuurt: { id, name, quantity, unit, source_label, recipe_id, checked }.
    items: [],
    loaded: false,
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

    // "Variatie op lijst": de server stelt de regels samen en geeft ze terug.
    async addVariation(recipeId, variationId, servings) {
      this.changes++
      this.items.push(...(await addVariationToShoppingList(recipeId, variationId, servings)))
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
  },
})
