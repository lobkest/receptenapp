<script setup>
import { computed } from 'vue'
import { useHouseStatus } from '@/composables/useHouseStatus'
import { usePantryStore } from '@/stores/pantry'

// Het huisje naast de lijstknop (receptpagina, variaties, standaardlijst):
//   in huis      → "🏠 in huis", gevuld amber
//   niet in huis → klein, grijs, omlijnd huisje
//   geen bestaand ingrediënt (of voorraad nog niet geladen) → niets
// Een tik zet het in de voorraad of haalt het eruit (ook basisvoorraad), zonder vraag:
// nog een tik zet het terug. Het icoon is dat van "In huis" in het menu.
const props = defineProps({
  // { ingredient_id, name }; zonder ingredient_id telt de naam.
  ingredient: { type: Object, required: true },
})

// Een mislukte tik (netwerk, server): de pagina toont de melding.
const emit = defineEmits(['error'])

const pantry = usePantryStore()
const { statusOf } = useHouseStatus()
const status = computed(() => statusOf(props.ingredient))

async function toggle() {
  const { ingredientId, inHouse } = status.value
  try {
    await pantry.toggleInHouse(ingredientId, props.ingredient.name, !inHouse)
  } catch (e) {
    emit('error', e.message)
  }
}
</script>

<template>
  <button
    v-if="status"
    type="button"
    class="house-button"
    :class="{ 'in-house': status.inHouse }"
    :aria-pressed="status.inHouse"
    :aria-label="
      status.inHouse
        ? `${ingredient.name} is in huis; tik om uit de voorraad te halen`
        : `${ingredient.name} is niet in huis; tik om in de voorraad te zetten`
    "
    :disabled="pantry.busy.has(status.ingredientId)"
    @click="toggle"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M3 11 12 4l9 7" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-5h4v5" />
    </svg>
    <span v-if="status.inHouse" class="house-text">in huis</span>
  </button>
</template>

<style scoped>
.house-button {
  display: inline-flex;
  flex-shrink: 0;
  gap: var(--space-1);
  align-items: center;
  padding: var(--space-1) var(--space-2);
  font-size: var(--text-sm);
  font-weight: 600;
  white-space: nowrap;
  color: var(--color-text-muted);
  background: transparent;
  border: 1px solid var(--color-border);
}

.house-button svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* Gevuld amber: anders dan het groene "✓ op lijst", zodat beide naast elkaar te lezen zijn. */
.in-house,
.in-house:hover:not(:disabled) {
  color: var(--color-house-text);
  background: var(--color-house-soft);
  border-color: var(--color-house-border);
}

/* Even uitgeschakeld tijdens het opslaan, maar niet half doorzichtig: dat flikkert. */
.house-button:disabled {
  opacity: 1;
}
</style>
