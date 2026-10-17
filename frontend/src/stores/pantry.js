import { defineStore } from 'pinia'
import * as api from '@/api/pantry'

// Telt elke loadRecipes(): alleen het antwoord op de laatste telt (snel filters aantikken).
let latestRecipes = 0

// "In huis": de voorraad en de recepten die je ermee kunt maken. Alles staat op de server
// (één voorraad voor iedereen met de link); hier alleen wat de pagina laat zien. De pagina
// ververst bij openen en bij terugkeren naar de app, net als de lijsten.
export const usePantryStore = defineStore('pantry', {
  state: () => ({
    // Zoals /api/pantry: { in_house, staples, suggestions }, of null voor het laden.
    pantry: null,
    // Zoals /api/pantry/recipes: drie groepen (0, 1 en 2 ontbrekend).
    groups: [],
    // Het tagfilter van de laatste loadRecipes().
    tags: [],
    // Een ingrediënt dat nu wordt opgeslagen (id), zodat je niet twee keer tikt.
    busy: new Set(),
  }),

  getters: {
    inHouse: (state) => state.pantry?.in_house ?? [],
    staples: (state) => state.pantry?.staples ?? [],
    suggestions: (state) => state.pantry?.suggestions ?? [],
    // Nog niets aangepast: niets extra in huis en geen basis op.
    isDefault: (state) =>
      !!state.pantry &&
      state.pantry.in_house.length === 0 &&
      state.pantry.staples.every((staple) => staple.present),
    // Alle recepten uit de drie groepen, voor de categorie-chips.
    allRecipes: (state) => state.groups.flatMap((group) => group.recipes),
  },

  actions: {
    // Voorraad en recepten tegelijk. Een fout gooien we door (de pagina laat de serverstatus
    // opnieuw kijken); de oude stand blijft staan.
    async load(tags = this.tags) {
      await Promise.all([this.loadPantry(), this.loadRecipes(tags)])
    },

    async loadPantry() {
      this.pantry = await api.fetchPantry()
    },

    async loadRecipes(tags = this.tags) {
      const current = ++latestRecipes
      this.tags = tags
      const groups = await api.fetchPantryRecipes({ tags })
      if (current === latestRecipes) this.groups = groups
    },

    // In huis (true) of eruit (false). Daarna de recepten opnieuw, want wat ontbreekt
    // is veranderd. Een fout gooien we door: de pagina toont een melding.
    async set(ingredientId, present) {
      if (this.busy.has(ingredientId)) return
      this.busy.add(ingredientId)
      try {
        this.pantry = await api.setInHouse(ingredientId, present)
        await this.loadRecipes()
      } finally {
        this.busy.delete(ingredientId)
      }
    },

    async reset() {
      this.pantry = await api.resetPantry()
      await this.loadRecipes()
    },
  },
})
