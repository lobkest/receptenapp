<script setup>
import { computed } from 'vue'

// Porties kiezen op de receptpagina: − en +, en terug naar het aantal van het recept.
// v-model is het gekozen aantal; de pagina bewaart het, want ingrediënten, variaties en
// "op lijst" rekenen ermee.
const servings = defineModel({ type: Number, required: true })

const props = defineProps({
  // Het aantal porties van het recept zelf.
  original: { type: Number, required: true },
})

// Gelijk aan de server (Recipe::MAX_SERVINGS).
const MIN_SERVINGS = 1
const MAX_SERVINGS = 50

const isOriginal = computed(() => servings.value === props.original)

function change(delta) {
  servings.value = Math.min(MAX_SERVINGS, Math.max(MIN_SERVINGS, servings.value + delta))
}
</script>

<template>
  <div class="servings">
    <button
      type="button"
      class="round"
      aria-label="Minder porties"
      :disabled="servings <= MIN_SERVINGS"
      @click="change(-1)"
    >
      −
    </button>
    <span class="servings-count">{{ servings }} {{ servings === 1 ? 'portie' : 'porties' }}</span>
    <button
      type="button"
      class="round"
      aria-label="Meer porties"
      :disabled="servings >= MAX_SERVINGS"
      @click="change(1)"
    >
      +
    </button>
    <button v-if="!isOriginal" type="button" class="reset" @click="servings = original">
      Terug naar origineel ({{ original }})
    </button>
  </div>
</template>

<style scoped>
.servings {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
  margin-bottom: var(--space-4);
}

.round {
  width: var(--tap);
  padding: 0;
  font-size: var(--text-lg);
  border-radius: var(--radius-full);
}

.servings-count {
  min-width: 6rem;
  font-weight: 600;
  text-align: center;
}

.reset {
  font-size: var(--text-sm);
}
</style>
