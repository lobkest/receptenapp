import { defineStore } from 'pinia'
import { fetchCategories, fetchRecipes, fetchTags } from '@/api/recipes'

// Telt elke load(): alleen het antwoord op de laatste mag de lijst vullen. Tik je snel
// twee filters aan, dan kan het antwoord op de eerste anders later binnenkomen.
let latestLoad = 0

// De lijst met zichtbare recepten (zonder verwijderverzoek), gedeeld tussen pagina's.
// Blijft bewaard als je naar een detailpagina gaat en terugkomt.
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
    async load(tags = this.filter, ingredientIds = this.ingredientFilter) {
      const current = ++latestLoad
      this.filter = tags
      this.ingredientFilter = ingredientIds
      this.loading = true
      this.error = null
      try {
        const recipes = await fetchRecipes(tags, ingredientIds)
        if (current === latestLoad) this.recipes = recipes
      } catch (e) {
        if (current === latestLoad) this.error = e.message
      } finally {
        if (current === latestLoad) this.loading = false
      }
    },

    // Fouten negeren we: zonder tags werken het overzicht en de tag-kiezer gewoon
    // (je kunt dan alleen nieuwe tags typen en niet filteren).
    async loadTags() {
      try {
        this.tags = await fetchTags()
      } catch {
        // De oude tags blijven staan.
      }
    },

    // Net als bij de tags: zonder categorieën werkt alles, je kunt dan alleen een nieuwe
    // categorie typen, en het overzicht haalt de secties uit de recepten zelf.
    async loadCategories() {
      try {
        this.categories = await fetchCategories()
      } catch {
        // De oude categorieën blijven staan.
      }
    },
  },
})
