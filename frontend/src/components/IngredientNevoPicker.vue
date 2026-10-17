<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { searchNevoFoods } from '@/api/ingredients'
import { formatDecimal } from '@/utils/format'

// Het NEVO-product van een ingrediënt kiezen, op het bewerkscherm: wat nu gekozen is, en
// zoeken in NEVO. Bij openen zoekt het al op de naam van het ingrediënt (suggesties);
// daarna kun je zelf zoeken. Een keuze hoort bij het formulier van IngredientEditView:
// pas "Opslaan" bewaart hem.
const props = defineProps({
  // De naam van het ingrediënt: de eerste zoekterm.
  name: { type: String, required: true },
  // Het opgeslagen NEVO-product (of null), om "nog niet opgeslagen" te kunnen zeggen.
  saved: { type: Object, default: null },
  // Een veldfout van de server bij nevo_food.
  error: { type: String, default: null },
})

// Het gekozen product in het formulier (v-model:food), of null.
const food = defineModel('food', { type: Object, default: null })

// Iemand koos (of ontkoppelde) zelf: de view haalt dan een oude melding weg.
const emit = defineEmits(['chosen'])

const search = ref(props.name)
const results = ref([])
const searching = ref(false)
const searchError = ref(null)
let searchTimer = null
// Pas zoeken vanaf zoveel tekens, en als je zo lang (ms) niet meer typt.
const MIN_SEARCH_LENGTH = 2
const SEARCH_DELAY_MS = 300
// Alleen het antwoord op de laatste zoekopdracht telt (een trage eerdere komt soms later).
let searchNumber = 0

async function runSearch() {
  clearTimeout(searchTimer)
  const query = search.value.trim()
  const number = ++searchNumber
  if (query.length < MIN_SEARCH_LENGTH) {
    results.value = []
    return
  }
  searching.value = true
  searchError.value = null
  try {
    const found = await searchNevoFoods(query)
    if (number === searchNumber) results.value = found
  } catch (e) {
    if (number === searchNumber) searchError.value = e.message
  } finally {
    if (number === searchNumber) searching.value = false
  }
}

function onSearchInput() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(runSearch, SEARCH_DELAY_MS)
}

onMounted(runSearch)
onUnmounted(() => clearTimeout(searchTimer))

function choose(chosen) {
  food.value = chosen
  emit('chosen')
}

const linkChanged = computed(() => (food.value?.id ?? null) !== (props.saved?.id ?? null))

// "per 100 g: 132 kcal · 12,3 g eiwit"
function per100(product) {
  const value = (v, unit) => (v == null ? `? ${unit}` : `${formatDecimal(v)} ${unit}`)
  return `per 100 ${product.unit}: ${value(product.kcal, 'kcal')} · ${value(product.protein, 'g')} eiwit`
}
</script>

<template>
  <section class="card section">
    <h2>NEVO-product</h2>
    <div v-if="food" class="chosen">
      <p class="food-name">{{ food.name }}</p>
      <p v-if="food.official_name !== food.name" class="muted small">
        NEVO: {{ food.official_name }} ({{ food.code }})
      </p>
      <p class="muted small">{{ per100(food) }}</p>
      <p v-if="linkChanged" class="small changed">Nog niet opgeslagen</p>
      <button type="button" class="unlink" @click="choose(null)">Ontkoppelen</button>
    </div>
    <p v-else class="muted">
      Niet gekoppeld<span v-if="linkChanged"> (nog niet opgeslagen)</span>.
    </p>
    <p v-if="error" class="error">{{ error }}</p>

    <div class="field search-field">
      <label for="nevo-search">Zoek in NEVO</label>
      <input
        id="nevo-search"
        v-model="search"
        type="search"
        autocomplete="off"
        @input="onSearchInput"
        @keydown.enter.prevent="runSearch"
      />
    </div>
    <p v-if="searchError" class="error">{{ searchError }}</p>
    <p v-else-if="searching" class="muted small">Zoeken…</p>
    <p v-else-if="search.trim().length >= MIN_SEARCH_LENGTH && !results.length" class="muted small">
      Niets gevonden. Probeer een ander woord, bijv. zonder meervoud.
    </p>
    <ul v-if="results.length" class="results" aria-label="Suggesties uit NEVO">
      <li v-for="product in results" :key="product.id">
        <div>
          <p class="food-name">{{ product.name }}</p>
          <p class="muted small">{{ per100(product) }}</p>
        </div>
        <button
          type="button"
          :disabled="food?.id === product.id"
          :aria-label="`Kies ${product.name}`"
          @click="choose(product)"
        >
          {{ food?.id === product.id ? 'Gekozen' : 'Kies' }}
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
/* Zoals de andere secties van het bewerkscherm (IngredientEditView). */
.section {
  margin-bottom: var(--space-4);
}

.section h2 {
  margin-bottom: var(--space-2);
}

.small {
  font-size: var(--text-sm);
}

.section p {
  margin-bottom: var(--space-2);
}

.chosen {
  margin-bottom: var(--space-3);
  padding: var(--space-2) var(--space-3);
  background: var(--color-brand-soft);
  border-radius: var(--radius);
}

.chosen p {
  margin: 0 0 var(--space-1);
}

.food-name {
  margin: 0;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.changed {
  font-weight: 600;
  color: var(--color-accent-text);
}

.unlink {
  margin-top: var(--space-1);
  font-size: var(--text-sm);
}

.search-field {
  margin-bottom: var(--space-2);
}

.results {
  margin: 0;
  padding: 0;
  list-style: none;
}

.results li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) 0;
  border-top: 1px solid var(--color-border);
}

.results li > div {
  min-width: 0;
}

.results p {
  margin: 0;
}

.results button {
  flex-shrink: 0;
}
</style>
