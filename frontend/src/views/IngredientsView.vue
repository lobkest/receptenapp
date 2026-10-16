<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { fetchIngredients } from '@/api/ingredients'

// Alle ingrediënten, om ze aan NEVO te koppelen voor de voedingswaarde. Zoeken en filteren
// gebeurt hier in de browser (het zijn er hooguit een paar honderd). Zoekterm en filter
// staan in de URL (?zoek=&filter=), zodat "terug" vanaf een ingrediënt ze bewaart.
const route = useRoute()
const router = useRouter()

const ingredients = ref([])
const loading = ref(false)
const error = ref(null)

onMounted(async () => {
  loading.value = true
  try {
    ingredients.value = await fetchIngredients()
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
})

const FILTERS = [
  { key: 'alle', label: 'Alle', test: () => true },
  {
    key: 'ongekoppeld',
    label: 'Nog niet gekoppeld',
    // Verwaarloosbaar (bakpoeder) hoeft geen koppeling.
    test: (i) => !i.nevo_food && !i.label_values && !i.negligible,
  },
  { key: 'controleren', label: 'Te controleren', test: (i) => i.needs_review },
]

const query = ref(String(route.query.zoek ?? ''))
const filter = ref(FILTERS.some((f) => f.key === route.query.filter) ? route.query.filter : 'alle')

watch([query, filter], ([zoek, chosen]) => {
  router.replace({
    query: { ...(zoek ? { zoek } : {}), ...(chosen === 'alle' ? {} : { filter: chosen }) },
  })
})

function countFor(key) {
  return ingredients.value.filter(FILTERS.find((f) => f.key === key).test).length
}

// Op de naam van het ingrediënt én van het gekoppelde NEVO-product.
const shown = computed(() => {
  const words = query.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const test = FILTERS.find((f) => f.key === filter.value).test
  return ingredients.value.filter((ingredient) => {
    const text = `${ingredient.name} ${ingredient.nevo_food?.name ?? ''}`.toLowerCase()
    return test(ingredient) && words.every((word) => text.includes(word))
  })
})
</script>

<template>
  <h1>Ingrediënten</h1>
  <p class="muted intro">
    Koppel een ingrediënt aan een product uit NEVO-online (RIVM), dan telt het mee in de
    voedingswaarde van recepten.
  </p>

  <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>

  <div class="field">
    <label for="ingredient-search">Zoeken</label>
    <input id="ingredient-search" v-model="query" type="search" autocomplete="off" />
  </div>

  <div class="chip-row" role="group" aria-label="Filter">
    <button
      v-for="option in FILTERS"
      :key="option.key"
      type="button"
      class="filter-chip"
      :aria-pressed="filter === option.key"
      @click="filter = option.key"
    >
      {{ option.label }} <span class="count">{{ countFor(option.key) }}</span>
    </button>
  </div>

  <p v-if="loading" class="muted">Ingrediënten laden…</p>
  <p v-else-if="!error && shown.length === 0" class="empty card">Geen ingrediënten gevonden.</p>

  <ul v-if="shown.length" class="ingredient-list card">
    <li v-for="ingredient in shown" :key="ingredient.id">
      <RouterLink :to="{ name: 'ingredient', params: { id: ingredient.id } }">
        <span class="name">{{ ingredient.name }}</span>
        <span class="nevo" :class="{ missing: !ingredient.nevo_food }">
          {{ ingredient.nevo_food?.name ?? 'Niet gekoppeld' }}
        </span>
        <span class="badges">
          <span v-if="ingredient.needs_review" class="badge review">te controleren</span>
          <span v-if="ingredient.label_values" class="badge">etiket</span>
          <span v-if="ingredient.negligible" class="badge">verwaarloosbaar</span>
        </span>
      </RouterLink>
    </li>
  </ul>
</template>

<style scoped>
.empty {
  text-align: center;
}

.intro {
  margin-bottom: var(--space-3);
}

.chip-row {
  display: flex;
  gap: var(--space-2);
  margin: 0 calc(-1 * var(--space-4)) var(--space-3);
  padding: var(--space-1) var(--space-4);
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
}

.chip-row::-webkit-scrollbar {
  display: none;
}

/* Zoals de chips op het receptenoverzicht. */
.filter-chip {
  flex-shrink: 0;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-sm);
  color: var(--color-text);
  background: var(--color-surface);
  border-color: var(--color-border-strong);
  border-radius: var(--radius-full);
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
  opacity: 0.85;
}

.ingredient-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.ingredient-list li + li {
  border-top: 1px solid var(--color-border);
}

.ingredient-list a {
  display: grid;
  grid-template-columns: 1fr auto;
  column-gap: var(--space-2);
  min-height: var(--tap);
  padding: var(--space-2) var(--space-3);
  color: var(--color-text);
  text-decoration: none;
}

.ingredient-list a:hover {
  background: var(--color-surface-hover);
}

.name {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.nevo {
  grid-column: 1;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  overflow-wrap: anywhere;
}

.nevo.missing {
  font-style: italic;
}

.badges {
  grid-column: 2;
  grid-row: 1 / span 2;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  gap: var(--space-1);
}

.badge {
  padding: 0 var(--space-2);
  font-size: var(--text-xs);
  font-weight: 600;
  line-height: 1.6;
  color: var(--color-accent-text);
  white-space: nowrap;
  background: var(--color-brand-soft);
  border-radius: var(--radius-full);
}

.badge.review {
  color: var(--color-error-text);
  background: var(--color-error-soft);
}
</style>
