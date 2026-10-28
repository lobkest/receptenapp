<script setup>
import { computed } from 'vue'
import { useHouseStatus } from '@/composables/useHouseStatus'
import { usePantryStore } from '@/stores/pantry'
import { normalizeName } from '@/stores/shoppingList'

// Het huisje naast de lijstknop (receptpagina, variaties, standaardlijst):
//   in huis      → "🏠 in huis", gevuld amber
//   niet in huis → klein, grijs, omlijnd huisje
//   geen bestaand ingrediënt (of voorraad nog niet geladen) → niets
// Een tik zet het in de voorraad of haalt het eruit (ook basisvoorraad), zonder vraag:
// nog een tik zet het terug. Het icoon is dat van "In huis" in het menu.
//
// Op de standaardlijst (compact): alleen het icoon, aan = gevuld groen, en ook een huisje
// bij een naam zonder ingrediënt (createMissing); de eerste tik maakt dat ingrediënt aan.
const props = defineProps({
  // { ingredient_id, name }; zonder ingredient_id telt de naam.
  ingredient: { type: Object, required: true },
  compact: { type: Boolean, default: false },
  createMissing: { type: Boolean, default: false },
})

// Een mislukte tik (netwerk, server): de pagina toont de melding.
const emit = defineEmits(['error'])

const pantry = usePantryStore()
const { statusOf } = useHouseStatus()
const status = computed(() => {
  const known = statusOf(props.ingredient)
  if (known || !props.createMissing || !pantry.presentIds) return known
  return { ingredientId: null, inHouse: false }
})
const busy = computed(() =>
  pantry.busy.has(status.value?.ingredientId ?? normalizeName(props.ingredient.name)),
)

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
    :class="{ 'in-house': status.inHouse, compact }"
    :aria-pressed="status.inHouse"
    :aria-label="
      status.inHouse
        ? `${ingredient.name} is in huis; tik om uit de voorraad te halen`
        : `${ingredient.name} is niet in huis; tik om in de voorraad te zetten`
    "
    :disabled="busy"
    @click="toggle"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M3 11 12 4l9 7" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-5h4v5" />
    </svg>
    <span v-if="status.inHouse && !compact" class="house-text">in huis</span>
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

/* Compact (standaardlijst): een vierkant tikvlak met alleen het icoon, zodat de naam ruimte
   houdt. Aan = lichtgroen gevuld met groene rand: naast de donkergroene "✓ op lijst"-pil
   blijven ze uit elkaar te houden. */
.compact {
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
}

.compact svg {
  width: 18px;
  height: 18px;
}

.compact.in-house,
.compact.in-house:hover:not(:disabled) {
  color: var(--color-brand-strong);
  background: var(--color-brand-soft);
  border-color: var(--color-brand);
}

/* Even uitgeschakeld tijdens het opslaan, maar niet half doorzichtig: dat flikkert. */
.house-button:disabled {
  opacity: 1;
}
</style>
