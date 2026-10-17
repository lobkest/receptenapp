<script setup>
import { computed, ref } from 'vue'
import IngredientSuggestion from '@/components/IngredientSuggestion.vue'
import { useIngredientList, useIngredientNames } from '@/composables/useIngredientNames'
import { findIngredients, MIN_QUERY_LENGTH } from '@/utils/ingredientSearch'

// Een bestaand ingrediënt zoeken en kiezen: een zoekveld, daaronder "Bedoel je: …?" en de
// gevonden ingrediënten als chips (+ naam). Tikken of Enter (de eerste) kiest er een; dan
// is het veld weer leeg. Gedeeld door "Met ingrediënt…" op het receptenoverzicht
// (IngredientFilter) en het zoekveld op "In huis" (PantryStock).
const props = defineProps({
  // Ingrediënten (id's) die niet meer gevonden moeten worden: al gekozen, of al in huis.
  exclude: { type: Set, default: () => new Set() },
  // Met label: een zichtbaar label boven het veld (dan ook id). Zonder: ariaLabel.
  label: { type: String, default: null },
  id: { type: String, default: null },
  ariaLabel: { type: String, default: null },
  placeholder: { type: String, default: '' },
  // Als er niets gevonden is (vanaf MIN_QUERY_LENGTH tekens).
  emptyText: { type: String, default: 'Geen ingrediënt gevonden.' },
})

const emit = defineEmits(['choose'])

const ingredientList = useIngredientList()
const ingredientNames = useIngredientNames()
const query = ref('')

// Wat precies zo heet, staat bovenaan (findIngredients).
const matches = computed(() =>
  findIngredients(ingredientList.value, query.value, { exclude: props.exclude }),
)

function choose(ingredient) {
  query.value = ''
  emit('choose', ingredient)
}

function chooseFirstMatch() {
  if (matches.value.length) choose(matches.value[0])
}
</script>

<template>
  <div class="ingredient-search">
    <div :class="{ field: label }">
      <label v-if="label" :for="id">{{ label }}</label>
      <input
        :id="id"
        v-model="query"
        type="search"
        autocomplete="off"
        :placeholder="placeholder"
        :aria-label="label ? null : ariaLabel"
        @keydown.enter.prevent="chooseFirstMatch"
      />
      <IngredientSuggestion
        v-if="!matches.length"
        :name="query"
        :names="ingredientNames"
        @use="(name) => (query = name)"
      />
    </div>
    <ul v-if="matches.length" class="chips matches-found" aria-label="Gevonden ingrediënten">
      <li v-for="ingredient in matches" :key="ingredient.id">
        <button type="button" class="chip add-chip" @click="choose(ingredient)">
          + {{ ingredient.name }}
        </button>
      </li>
    </ul>
    <p v-else-if="query.trim().length >= MIN_QUERY_LENGTH" class="muted empty">
      {{ emptyText }}
    </p>
  </div>
</template>

<style scoped>
/* Met label: het veld zonder eigen marge, de chips eronder geven de ruimte. */
.field {
  margin-bottom: 0;
}

.empty {
  margin: var(--space-1) 0 0;
  font-size: var(--text-sm);
}

/* Chips die over meerdere regels doorlopen (geen scrollende rij: alles moet te zien zijn). */
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: var(--space-2) 0 0;
  padding: 0;
  list-style: none;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  min-height: var(--tap);
  max-width: 100%;
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-sm);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-full);
  overflow-wrap: anywhere;
}

.add-chip {
  color: var(--color-accent-text);
  background: var(--color-surface);
}
</style>
