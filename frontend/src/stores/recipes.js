import { defineStore } from 'pinia'
import { fetchCategories, fetchRecipes, fetchTags } from '@/api/recipes'
import { isNetworkError, isOffline } from '@/offline'
import { useSnapshotStore } from '@/stores/snapshot'
import { presentIngredientIds } from '@/utils/inHouse'
import { ingredientSearch, withAllTags } from '@/utils/offlineRecipes'

// Telt elke load(): alleen het antwoord op de laatste mag de lijst vullen. Tik je snel
// twee filters aan, dan kan het antwoord op de eerste anders later binnenkomen.
let latestLoad = 0

// Wat de server zou sturen, maar dan uit de offline snapshot: zelfde filter op tags en
// ingrediënten, in de browser (src/utils/offlineRecipes.js). null zonder snapshot.
function fromSnapshot(tags, ingredientIds) {
  const snapshot = useSnapshotStore()
  snapshot.restore()
  if (!snapshot.available) return null
  const recipes = withAllTags(snapshot.recipes, tags)
  if (!ingredientIds.length) return recipes
  return ingredientSearch(recipes, ingredientIds, presentIngredientIds(snapshot.data.pantry))
}

// De lijst met zichtbare recepten (zonder verwijderverzoek), gedeeld tussen pagina's.
// Blijft bewaard als je naar een detailpagina gaat en terugkomt.
// Offline (of zolang er nog niets van de server is) komen de recepten, tags en categorieën
// uit de offline snapshot (stores/snapshot.js); offline is dan true.
export const useRecipesStore = defineStore('recipes', {
  state: () => ({
    recipes: [],
    loading: false,
    error: null,
    // Het filter van de laatste load(): de getoonde recepten hebben al deze tags.
    filter: [],
    // De ingrediënten (id's) van de laatste load(); een recept heeft er minstens één.
    ingredientFilter: [],
    // Alle tags van zichtbare recepten, met aantal: [{ name, count, automatic }].
    // automatic: uitgerekend uit de ingrediënten (vegetarisch), niet zelf te kiezen.
    tags: [],
    // Alle categorieën op volgorde, ook zonder recepten: [{ id, name, position }].
    categories: [],
    // Korte melding die een paginawissel overleeft, bijv. "… is opgeslagen."
    notice: null,
    // true als de getoonde recepten uit de offline snapshot komen omdat de server niet te
    // bereiken is.
    offline: false,
  }),

  getters: {
    hasRecipes: (state) => state.recipes.length > 0,
    isEmpty: (state) => !state.loading && !state.error && state.recipes.length === 0,
    tagNames: (state) => state.tags.map((tag) => tag.name),
    // Wat je in een formulier zelf mag kiezen: zonder de automatische tags.
    manualTagNames: (state) => state.tags.filter((tag) => !tag.automatic).map((tag) => tag.name),
    automaticTagNames: (state) => state.tags.filter((tag) => tag.automatic).map((tag) => tag.name),
  },

  actions: {
    setNotice(message) {
      this.notice = message
    },

    // Haalt de melding op en wist hem, zodat hij maar één keer getoond wordt.
    takeNotice() {
      const message = this.notice
      this.notice = null
      return message
    },

    // Zonder argument: opnieuw laden met het huidige filter (bijv. na een beheeractie).
    // Staat er nog niets (eerste keer), dan meteen de recepten uit de snapshot; de server
    // vervangt ze zodra hij antwoordt. Offline alleen de snapshot.
    async load(tags = this.filter, ingredientIds = this.ingredientFilter) {
      const current = ++latestLoad
      this.filter = tags
      this.ingredientFilter = ingredientIds
      this.error = null
      const cached = !this.recipes.length || isOffline() ? fromSnapshot(tags, ingredientIds) : null
      if (cached) this.recipes = cached
      if (isOffline() && cached) {
        this.offline = true
        this.loading = false
        return
      }
      this.loading = true
      try {
        const recipes = await fetchRecipes(tags, ingredientIds)
        if (current === latestLoad) {
          this.recipes = recipes
          this.offline = false
        }
      } catch (e) {
        if (current !== latestLoad) return
        const fallback = isNetworkError(e) ? fromSnapshot(tags, ingredientIds) : null
        if (fallback) {
          this.recipes = fallback
          this.offline = true
        } else {
          this.error = e.message
        }
      } finally {
        if (current === latestLoad) this.loading = false
      }
    },

    // Fouten negeren we: zonder tags werken het overzicht en de tag-kiezer gewoon
    // (je kunt dan alleen nieuwe tags typen en niet filteren).
    // Uit de snapshot zolang er nog geen tags zijn, of als ophalen niet lukt.
    async loadTags() {
      const snapshot = useSnapshotStore()
      snapshot.restore()
      if (!this.tags.length && snapshot.data) this.tags = snapshot.data.tags
      if (isOffline()) return
      try {
        this.tags = await fetchTags()
      } catch {
        // De oude tags blijven staan.
      }
    },

    // Net als bij de tags: zonder categorieën werkt alles, je kunt dan alleen een nieuwe
    // categorie typen, en het overzicht haalt de secties uit de recepten zelf.
    async loadCategories() {
      const snapshot = useSnapshotStore()
      snapshot.restore()
      if (!this.categories.length && snapshot.data) this.categories = snapshot.data.categories
      if (isOffline()) return
      try {
        this.categories = await fetchCategories()
      } catch {
        // De oude categorieën blijven staan.
      }
    },
  },
})
