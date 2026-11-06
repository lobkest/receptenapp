import { defineStore } from 'pinia'

// De lijsten waar je vanaf een recept naar terug wilt: het receptenoverzicht en "In huis".
export const LIST_ROUTES = ['recipes', 'pantry']

// Waar je op het receptenoverzicht en "In huis" het laatst was, met het filter in de URL
// (useRecipeFilter.js). Zo brengt "← Recepten" op de receptpagina en de menulink je terug
// naar dezelfde gefilterde lijst. Alleen in het geheugen: na herladen of een directe link
// begin je weer bij de lege lijst. Bijgewerkt door router.afterEach (router/index.js).
export const useLastListRouteStore = defineStore('lastListRoute', {
  state: () => ({
    // Per lijst de laatste fullPath (bijv. "/?tags=snel"), of null als je er nog niet was.
    paths: { recipes: null, pantry: null },
    // Welke van de twee het laatst bezocht is.
    last: null,
  }),
  getters: {
    // Waar het menu naartoe linkt; zonder opgeslagen pad de lijst zelf.
    recipesPath: (state) => state.paths.recipes ?? '/',
    pantryPath: (state) => state.paths.pantry ?? '/in-huis',
    // Waar de terugknop op de receptpagina heen gaat, met het label erbij.
    back: (state) =>
      state.last === 'pantry'
        ? { to: state.paths.pantry, label: '← In huis' }
        : { to: state.paths.recipes ?? { name: 'recipes' }, label: '← Recepten' },
  },
  actions: {
    remember(route) {
      if (!LIST_ROUTES.includes(route.name)) return
      this.paths[route.name] = route.fullPath
      this.last = route.name
    },
  },
})
