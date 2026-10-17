<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import RecipeCard from '@/components/RecipeCard.vue'
import RecipeFilterChips from '@/components/RecipeFilterChips.vue'
import { useRecipeFilter } from '@/composables/useRecipeFilter'
import { useRecipesStore } from '@/stores/recipes'
import { categoryChips, recipeSections } from '@/utils/categories'
import { sortByCardHeight } from '@/utils/sortRecipes'

const store = useRecipesStore()
// Een melding van de vorige pagina, bijv. "… is verwijderd." na een verwijderverzoek.
const notice = ref(store.takeNotice())

// Het filter staat in de URL (?tags=vega,snel&category=3), zie useRecipeFilter. Filteren
// op tags doet de server; op categorie gebeurt hier in de browser, de lijst van de server
// blijft dan dezelfde.
const { selectedTags, selectedCategory } = useRecipeFilter()

// Bij "Alles" een sectie per categorie met recepten; bij een gekozen categorie alleen die.
// Binnen elke sectie op kaarthoogte (aantal tag-chips), zodat kaarten van gelijke hoogte
// naast elkaar staan.
const sections = computed(() =>
  recipeSections(store.recipes, store.categories, {
    selected: selectedCategory.value,
    tags: selectedTags.value,
  }).map((section) => ({ ...section, recipes: sortByCardHeight(section.recipes) })),
)

// "Geen recepten in Lunch met vega + snel". Een onbekende categorie (oude link) heeft
// geen naam.
const noResultsInCategory = computed(() => {
  const name = categoryChips(store.categories, store.recipes, selectedCategory.value).find(
    (chip) => chip.key === selectedCategory.value,
  )?.name
  const tags = selectedTags.value.length ? ` met ${selectedTags.value.join(' + ')}` : ''
  return `Geen recepten in ${name ?? 'deze categorie'}${tags}`
})

// Laden bij openen en bij elke wijziging van het filter. Altijd verversen; een eerder
// geladen lijst blijft zichtbaar tot de nieuwe binnen is.
watch(
  () => selectedTags.value.join(','),
  () => store.load(selectedTags.value),
  { immediate: true },
)
onMounted(() => {
  store.loadTags()
  store.loadCategories()
})
</script>

<template>
  <h1>Recepten</h1>

  <p v-if="notice" class="notice notice-success" role="status">{{ notice }}</p>

  <RecipeFilterChips :categories="store.categories" :recipes="store.recipes" :tags="store.tags" />

  <p v-if="store.loading && !store.hasRecipes" class="muted">Recepten laden…</p>

  <div v-else-if="store.error" class="notice notice-error" role="alert">
    <p>{{ store.error }}</p>
    <button type="button" class="btn-primary" @click="store.load()">Opnieuw proberen</button>
  </div>

  <p v-else-if="store.isEmpty && selectedTags.length" class="no-results card" role="status">
    Geen recepten met {{ selectedTags.join(' + ') }}
  </p>

  <p v-else-if="store.isEmpty" class="muted">Er zijn nog geen recepten.</p>

  <p v-else-if="!sections.length" class="no-results card" role="status">
    {{ noResultsInCategory }}
  </p>

  <div v-else class="sections">
    <section
      v-for="section in sections"
      :key="section.key"
      class="category-section"
      :aria-labelledby="`category-${section.key}`"
    >
      <h2 :id="`category-${section.key}`" class="section-title">{{ section.name }}</h2>
      <ul class="recipe-grid">
        <li v-for="recipe in section.recipes" :key="recipe.id">
          <RecipeCard :recipe="recipe" />
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.no-results {
  text-align: center;
}

.category-section + .category-section {
  margin-top: var(--space-6);
}

.section-title {
  margin-bottom: var(--space-3);
  font-size: var(--text-xl);
}

/* Twee kolommen op de telefoon, drie vanaf 640px (40rem), vier vanaf 1024px (64rem).
   minmax(0, 1fr): een kolom mag smaller worden dan zijn inhoud, dus niets loopt over.
   align-items: start: elke kaart zo hoog als zijn inhoud. Een kaart zonder foto naast
   een met foto wordt zo niet uitgerekt tot een groot leeg vlak. */
.recipe-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

@media (min-width: 40rem) {
  .recipe-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-4);
  }
}

@media (min-width: 64rem) {
  .recipe-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
</style>
