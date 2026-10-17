<script setup>
import { computed } from 'vue'
import IngredientSearchField from '@/components/IngredientSearchField.vue'
import { useRecipeFilter } from '@/composables/useRecipeFilter'

// "Met ingrediënt…" op het receptenoverzicht: zoek een ingrediënt en kies het; dan zie je
// de recepten waar het in zit (als origineel, als alternatief of optioneel). Meerdere
// mogen: een recept heeft er dan minstens één. Gekozen ingrediënten staan als chips met ×
// eronder. Het filter staat in de URL (?met=12,34), zie useRecipeFilter.
defineProps({
  // De gekozen ingrediënten met naam ([{ id, name }]), in de volgorde waarin ze gekozen zijn.
  chosen: { type: Array, required: true },
})

const { selectedIngredientIds, addIngredient, removeIngredient } = useRecipeFilter()
const exclude = computed(() => new Set(selectedIngredientIds.value))
</script>

<template>
  <div class="ingredient-filter">
    <IngredientSearchField
      :exclude="exclude"
      aria-label="Met ingrediënt"
      placeholder="Met ingrediënt…"
      @choose="(ingredient) => addIngredient(ingredient.id)"
    />

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

/* De gekozen ingrediënten, net als de gevonden in IngredientSearchField. */
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
