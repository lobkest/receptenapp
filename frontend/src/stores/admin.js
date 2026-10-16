import { defineStore } from 'pinia'
import * as api from '@/api/admin'
import { useRecipesStore } from '@/stores/recipes'

// sessionStorage: blijft bewaard bij herladen, maar verdwijnt als je het tabblad sluit.
const STORAGE_KEY = 'adminCode'

// In de privémodus of met geblokkeerde opslag kan sessionStorage een fout gooien.
function readStoredCode() {
  try {
    return sessionStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function storeCode(code) {
  try {
    if (code) {
      sessionStorage.setItem(STORAGE_KEY, code)
    } else {
      sessionStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // Dan werkt het alleen in het geheugen tot je herlaadt; geen probleem.
  }
}

// De beheercode en alle beheeracties. Views praten met deze store, niet direct
// met api/admin.js, zodat het meesturen van de code en het automatisch
// uitloggen bij een 401 op één plek geregeld zijn.
export const useAdminStore = defineStore('admin', {
  state: () => ({
    code: readStoredCode(),
    // Korte bevestiging die een paginawissel overleeft, bijv. na opslaan.
    flash: null,
  }),

  getters: {
    isLoggedIn: (state) => !!state.code,
  },

  actions: {
    // Controleert de code met een echte request; slaat hem alleen op als die lukt.
    // Gooit de ApiError door, zodat het inlogscherm de melding kan tonen.
    async login(code) {
      await api.fetchDeletionRequests(code)
      this.code = code
      storeCode(code)
    },

    logout() {
      this.code = null
      storeCode(null)
    },

    setFlash(message) {
      this.flash = message
    },

    // Haalt de flash op en wist hem, zodat hij maar één keer getoond wordt.
    takeFlash() {
      const message = this.flash
      this.flash = null
      return message
    },

    // Voert een API-functie uit met de huidige code. Bij een 401 is de code
    // kennelijk niet (meer) geldig: dan loggen we automatisch uit.
    async call(apiFunction, ...args) {
      try {
        return await apiFunction(this.code, ...args)
      } catch (e) {
        if (e.kind === 'unauthorized') this.logout()
        throw e
      }
    },

    // Na elke wijziging de openbare lijst verversen. Bewust zonder await:
    // de beheeractie is al gelukt, en de store vangt zijn eigen fouten af.
    refreshPublicRecipes() {
      const recipes = useRecipesStore()
      recipes.load()
      recipes.loadTags()
    },

    fetchDeletionRequests() {
      return this.call(api.fetchDeletionRequests)
    },

    async destroy(id) {
      await this.call(api.deleteRecipe, id)
      this.refreshPublicRecipes()
    },

    async restore(id) {
      const recipe = await this.call(api.restoreRecipe, id)
      this.refreshPublicRecipes()
      return recipe
    },

    // Een variatie verandert de receptenlijst niet; verversen is niet nodig.
    destroyVariation(id) {
      return this.call(api.deleteVariation, id)
    },

    restoreVariation(id) {
      return this.call(api.restoreVariation, id)
    },

    fetchVersions(id) {
      return this.call(api.fetchRecipeVersions, id)
    },

    // code: als je nog niet bent ingelogd, de code uit het bevestigingsvenster. Lukt het,
    // dan blijft die bewaard zoals na inloggen.
    async mergeIngredient(id, targetId, code = null) {
      if (!code) return this.call(api.mergeIngredient, id, targetId)

      const result = await api.mergeIngredient(code, id, targetId)
      this.code = code
      storeCode(code)
      return result
    },

    async restoreVersion(id, versionId) {
      const recipe = await this.call(api.restoreRecipeVersion, id, versionId)
      this.refreshPublicRecipes()
      return recipe
    },
  },
})
