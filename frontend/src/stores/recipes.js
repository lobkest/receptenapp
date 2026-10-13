import { defineStore } from 'pinia'
import { fetchRecipes } from '@/api/recipes'

// De lijst met goedgekeurde recepten, gedeeld tussen pagina's.
// Blijft bewaard als je naar een detailpagina gaat en terugkomt.
export const useRecipesStore = defineStore('recipes', {
  state: () => ({
    recipes: [],
    loading: false,
    error: null,
  }),

  getters: {
    hasRecipes: (state) => state.recipes.length > 0,
    isEmpty: (state) => !state.loading && !state.error && state.recipes.length === 0,
  },

  actions: {
    async load() {
      this.loading = true
      this.error = null
      try {
        this.recipes = await fetchRecipes()
      } catch (e) {
        this.error = e.message
      } finally {
        this.loading = false
      }
    },
  },
})
