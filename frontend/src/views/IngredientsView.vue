<script setup>
import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { fetchIngredients, updateIngredientTraits } from '@/api/ingredients'
import { searchWords } from '@/utils/ingredientSearch'

// Alle ingrediënten, om ze aan NEVO te koppelen voor de voedingswaarde en hun kenmerken
// (vlees, gluten, ...) te zien voor de automatische tags. Zoeken en filteren
// gebeurt hier in de browser (het zijn er hooguit een paar honderd). Zoekterm en filter
// staan in de URL (?zoek=&filter=), zodat "terug" vanaf een ingrediënt ze bewaart.
const route = useRoute()
const router = useRouter()

const ingredients = ref([])
const loading = ref(false)
const error = ref(null)

// Een filter uit de URL kan rechts buiten de scrollende rij vallen: schuif het in beeld.
const chipRow = useTemplateRef('chipRow')
onMounted(async () => {
  await nextTick()
  chipRow.value
    ?.querySelector('[aria-pressed="true"]')
    ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
})

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
  // De kenmerken voor de automatische tags (vegetarisch, ...), los van NEVO.
  { key: 'kenmerken', label: 'Kenmerken te controleren', test: (i) => !i.traits_checked },
  // Basisvoorraad: standaard in huis ("In huis").
  { key: 'basis', label: 'Basis', test: (i) => i.staple },
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

// "✓": de kenmerken kloppen. Alleen traits_checked gaat naar de server; daarna past de rij
// hier meteen aan, en valt hij uit het filter "Kenmerken te controleren".
const checking = ref(new Set())

async function markChecked(ingredient) {
  checking.value = new Set(checking.value).add(ingredient.id)
  error.value = null
  try {
    const updated = await updateIngredientTraits(ingredient.id, { traits_checked: true })
    ingredients.value = ingredients.value.map((other) =>
      other.id === ingredient.id ? { ...other, traits_checked: updated.traits_checked } : other,
    )
  } catch (e) {
    error.value = e.message
  } finally {
    const next = new Set(checking.value)
    next.delete(ingredient.id)
    checking.value = next
  }
}

// Op de naam van het ingrediënt én van het gekoppelde NEVO-product.
const shown = computed(() => {
  const words = searchWords(query.value)
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
    voedingswaarde van recepten. De kenmerken bepalen de automatische tags, zoals vegetarisch.
  </p>

  <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>

  <div class="field">
    <label for="ingredient-search">Zoeken</label>
    <input id="ingredient-search" v-model="query" type="search" autocomplete="off" />
  </div>

  <div ref="chipRow" class="chip-row" role="group" aria-label="Filter">
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
          <span v-if="ingredient.staple" class="badge">basis</span>
        </span>
        <span
          v-if="ingredient.traits?.length || !ingredient.traits_checked"
          class="traits"
          :aria-label="`Kenmerken van ${ingredient.name}`"
        >
          <span v-for="trait in ingredient.traits" :key="trait" class="trait">{{ trait }}</span>
          <span v-if="!ingredient.traits_checked" class="trait unchecked">
            kenmerken controleren
          </span>
        </span>
      </RouterLink>
      <!-- Naast de link, niet erin: een knop in een link werkt niet goed. -->
      <button
        v-if="!ingredient.traits_checked"
        type="button"
        class="mark-checked"
        :aria-label="`${ingredient.name} gecontroleerd`"
        title="Kenmerken kloppen"
        :disabled="checking.has(ingredient.id)"
        @click="markChecked(ingredient)"
      >
        ✓
      </button>
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

/* De link vult de rij; de ✓-knop (alleen als de kenmerken nog te controleren zijn) staat
   er rechts naast, verticaal in het midden. */
.ingredient-list li {
  display: flex;
  align-items: center;
}

.ingredient-list a {
  flex: 1;
  min-width: 0;
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

.mark-checked {
  flex-shrink: 0;
  width: var(--tap);
  height: var(--tap);
  margin-right: var(--space-2);
  padding: 0;
  font-size: var(--text-lg);
  color: var(--color-accent-text);
  background: var(--color-surface);
  border-color: var(--color-border-strong);
  border-radius: var(--radius-full);
}

/* Kenmerken onder de naam, over de hele breedte: klein en met een rand, zodat ze niet op
   de badges rechts lijken. */
.traits {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin-top: var(--space-1);
}

.trait {
  padding: 0 var(--space-2);
  font-size: var(--text-xs);
  line-height: 1.5;
  color: var(--color-text-muted);
  white-space: nowrap;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-full);
}

.trait.unchecked {
  color: var(--color-error-text);
  border-style: dashed;
  border-color: currentColor;
}
</style>
