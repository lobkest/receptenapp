<script setup>
import { computed, ref } from 'vue'
import IngredientSuggestion from '@/components/IngredientSuggestion.vue'
import { useIngredientList, useIngredientNames } from '@/composables/useIngredientNames'
import { useRecipeFilter } from '@/composables/useRecipeFilter'
import { findIngredients } from '@/utils/ingredientSearch'

// "Met ingrediënt…" op het receptenoverzicht: zoek een ingrediënt en kies het; dan zie je
// de recepten waar het in zit (als origineel, als alternatief of optioneel). Meerdere
// mogen: een recept heeft er dan minstens één. Gekozen ingrediënten staan als chips met ×
// eronder. Het filter staat in de URL (?met=12,34), zie useRecipeFilter.
defineProps({
  // De gekozen ingrediënten met naam ([{ id, name }]), in de volgorde waarin ze gekozen zijn.
  chosen: { type: Array, required: true },
})

const { selectedIngredientIds, addIngredient, removeIngredient } = useRecipeFilter()
const ingredientList = useIngredientList()
const ingredientNames = useIngredientNames()
const query = ref('')

const matches = computed(() =>
  findIngredients(ingredientList.value, query.value, {
    exclude: new Set(selectedIngredientIds.value),
  }),
)

function choose(ingredient) {
  query.value = ''
  addIngredient(ingredient.id)
}

function chooseFirstMatch() {
  if (matches.value.length) choose(matches.value[0])
}
</script>

<template>
  <div class="ingredient-filter">
    <input
      v-model="query"
      type="search"
      autocomplete="off"
      placeholder="Met ingrediënt…"
      aria-label="Met ingrediënt"
      @keydown.enter.prevent="chooseFirstMatch"
    />
    <IngredientSuggestion
      v-if="!matches.length"
      :name="query"
      :names="ingredientNames"
      @use="(name) => (query = name)"
    />
    <ul v-if="matches.length" class="chips" aria-label="Gevonden ingrediënten">
      <li v-for="ingredient in matches" :key="ingredient.id">
        <button type="button" class="chip add-chip" @click="choose(ingredient)">
          + {{ ingredient.name }}
        </button>
      </li>
    </ul>
    <p v-else-if="query.trim().length >= 2" class="muted small">Geen ingrediënt gevonden.</p>

    <ul v-if="chosen.length" class="chips chosen" aria-label="Gekozen ingrediënten">
      <li v-for="ingredient in chosen" :key="ingredient.id">
        <span class="chip chosen-chip">
          {{ ingredient.name }}
          <button
            type="button"
            class="chip-remove"
            :aria-label="`${ingredient.name} weghalen`"
            @click="removeIngredient(ingredient.id)"
          >
            ×
          </button>
        </span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.ingredient-filter {
  margin-bottom: var(--space-3);
}

.small {
  margin: var(--space-1) 0 0;
  font-size: var(--text-sm);
}

/* Chips die over meerdere regels doorlopen, zoals op "In huis". */
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

/* Gekozen: gevuld zoals een aangezette filterchip, met een × om weg te halen. */
.chosen-chip {
  padding-right: var(--space-1);
  font-weight: 600;
  color: var(--color-on-brand);
  background: var(--color-brand);
  border-color: var(--color-brand);
}

.chip-remove {
  min-width: 2rem;
  min-height: 2rem;
  padding: 0;
  font-size: var(--text-lg);
  line-height: 1;
  color: inherit;
  background: none;
  border: 0;
  border-radius: var(--radius-full);
}

.chip-remove:hover:not(:disabled) {
  color: inherit;
  background: color-mix(in srgb, var(--color-on-brand) 20%, transparent);
}
</style>
