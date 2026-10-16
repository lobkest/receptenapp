<script setup>
import { computed } from 'vue'
import { similarIngredient } from '@/utils/similarIngredient'

// Onder een invulveld voor een ingrediëntnaam: "Bedoel je: zoete aardappel?" als er een
// bestaand ingrediënt is dat erg lijkt. Tikken neemt die naam over; negeren mag ook.
const props = defineProps({
  name: { type: String, default: '' },
  // Alle bestaande namen (useIngredientNames).
  names: { type: Array, required: true },
})

const emit = defineEmits(['use'])

const suggestion = computed(() => similarIngredient(props.name, props.names))
</script>

<template>
  <p v-if="suggestion" class="ingredient-suggestion">
    Bedoel je:
    <button type="button" @click="emit('use', suggestion)">{{ suggestion }}</button>?
  </p>
</template>

<style scoped>
.ingredient-suggestion {
  margin: var(--space-1) 0 0;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

/* Een link-achtige knop, maar wel groot genoeg om te raken. */
button {
  min-height: var(--tap);
  min-width: 0;
  padding: 0;
  font-weight: 600;
  color: var(--color-accent-text);
  text-decoration: underline;
  text-underline-offset: 0.15em;
  background: none;
  border: 0;
}

button:hover:not(:disabled) {
  color: var(--color-text);
  background: none;
}
</style>
