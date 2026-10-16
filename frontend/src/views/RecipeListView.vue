<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import RecipeCard from '@/components/RecipeCard.vue'
import { useRecipesStore } from '@/stores/recipes'
import { categoryChips, recipeSections } from '@/utils/categories'

const store = useRecipesStore()
// Een melding van de vorige pagina, bijv. "… is verwijderd." na een verwijderverzoek.
const notice = ref(store.takeNotice())
const route = useRoute()
const router = useRouter()

// Het filter staat in de URL (?tags=vega,snel), niet in de store. Zo kom je met "terug"
// vanaf een recept weer bij hetzelfde filter, en kun je een gefilterde lijst delen.
const selectedTags = computed(() =>
  String(route.query.tags ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean),
)

// De gekozen categorie, ook in de URL: ?category=3, of ?category=overig voor recepten
// zonder categorie. Zonder: "Alles". Filteren op categorie gebeurt hier in de browser;
// de lijst van de server (al gefilterd op tags) blijft dezelfde.
const selectedCategory = computed(() =>
  route.query.category ? String(route.query.category) : null,
)

const categoryFilterChips = computed(() =>
  categoryChips(store.categories, store.recipes, selectedCategory.value),
)

// Bij "Alles" een sectie per categorie met recepten; bij een gekozen categorie alleen die.
const sections = computed(() =>
  recipeSections(store.recipes, store.categories, {
    selected: selectedCategory.value,
    tags: selectedTags.value,
  }),
)

// "Geen recepten in Lunch met vega + snel". Een onbekende categorie (oude link) heeft
// geen naam.
const noResultsInCategory = computed(() => {
  const name = categoryFilterChips.value.find((chip) => chip.key === selectedCategory.value)?.name
  const tags = selectedTags.value.length ? ` met ${selectedTags.value.join(' + ')}` : ''
  return `Geen recepten in ${name ?? 'deze categorie'}${tags}`
})

function selectCategory(key) {
  router.replace({ query: { ...route.query, category: key ?? undefined } })
}

// Alle tags met hun aantal, plus een gekozen tag die (niet meer) in /api/tags staat,
// bijv. uit een oude link: die moet je ook weer uit kunnen zetten.
const filterChips = computed(() => {
  const unknown = selectedTags.value
    .filter((name) => !store.tagNames.includes(name))
    .map((name) => ({ name, count: null }))
  return [...store.tags, ...unknown]
})

function isSelected(name) {
  return selectedTags.value.includes(name)
}

// replace, geen push: aan- en uitzetten van filters vult de geschiedenis niet, dus
// "terug" brengt je naar de vorige pagina, niet naar het vorige filter.
function setTags(tags) {
  router.replace({ query: { ...route.query, tags: tags.length ? tags.join(',') : undefined } })
}

// "Wis filters": tags en categorie, terug naar alles.
function clearFilters() {
  router.replace({ query: { ...route.query, tags: undefined, category: undefined } })
}

function toggle(name) {
  setTags(
    isSelected(name)
      ? selectedTags.value.filter((tag) => tag !== name)
      : [...selectedTags.value, name],
  )
}

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

  <div v-if="categoryFilterChips.length > 1 || filterChips.length" class="filter">
    <!-- Eén categorie tegelijk ("Alles" is geen filter). Bij veel chips scrolt alleen
         de rij opzij, niet de hele pagina. Alleen "Alles" (nog niets geladen) is geen rij. -->
    <div
      v-if="categoryFilterChips.length > 1"
      class="chip-row category-chips"
      role="group"
      aria-label="Filter op categorie"
    >
      <button
        v-for="chip in categoryFilterChips"
        :key="chip.key ?? 'alles'"
        type="button"
        class="filter-chip category-chip"
        :aria-pressed="chip.key === selectedCategory"
        @click="selectCategory(chip.key)"
      >
        {{ chip.name }}
      </button>
    </div>

    <!-- Tags: meerdere tegelijk, een recept moet ze allemaal hebben. -->
    <div
      v-if="filterChips.length"
      class="chip-row tag-chips"
      role="group"
      aria-label="Filter op tag"
    >
      <button
        v-for="tag in filterChips"
        :key="tag.name"
        type="button"
        class="filter-chip"
        :aria-pressed="isSelected(tag.name)"
        @click="toggle(tag.name)"
      >
        {{ tag.name }}
        <span v-if="tag.count != null" class="count">{{ tag.count }}</span>
      </button>
    </div>
    <button
      v-if="selectedTags.length || selectedCategory"
      type="button"
      class="clear-filters"
      @click="clearFilters"
    >
      Wis filters
    </button>
  </div>

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
.filter {
  margin-bottom: var(--space-4);
}

/* Eén regel chips die opzij scrolt. De negatieve marge laat de rij tot de rand van het
   scherm lopen (over de zijmarge van <main>); de padding houdt de eerste chip op zijn plek. */
.chip-row {
  display: flex;
  gap: var(--space-2);
  margin: 0 calc(-1 * var(--space-4));
  padding: var(--space-1) var(--space-4);
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
}

.chip-row::-webkit-scrollbar {
  display: none;
}

/* Tags onder de categorieën, met wat lucht ertussen. */
.tag-chips {
  margin-top: var(--space-1);
}

.filter-chip {
  flex-shrink: 0;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-sm);
  color: var(--color-accent-text);
  background: var(--color-surface);
  border-color: var(--color-border-strong);
  border-radius: var(--radius-full);
}

/* Categorieën: één keuze, iets steviger dan de tags, zodat de twee rijen niet op
   elkaar lijken. */
.category-chip {
  font-weight: 600;
  color: var(--color-text);
}

.filter-chip[aria-pressed='true'] {
  color: var(--color-on-brand);
  background: var(--color-brand);
  border-color: var(--color-brand);
}

.filter-chip[aria-pressed='true']:hover {
  color: var(--color-on-brand);
  background: var(--color-brand-strong);
}

.count {
  font-weight: 400;
  opacity: 0.8;
}

.clear-filters {
  margin-top: var(--space-2);
  font-size: var(--text-sm);
}

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
