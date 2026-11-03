<script setup>
import { MAX_COUNT } from '@/utils/shoppingListLine'

// Het aantal van een regel op de boodschappenlijst: [− 2 +]. Aanpassen gaat alleen met − en +;
// het getal zelf is gewone tekst. Het component bewaart zelf niets: het meldt een nieuw aantal
// (change) en toont wat count zegt. Bij 1 kan − niet: weghalen gaat alleen met het ✕ ernaast,
// zodat je niet per ongeluk een regel kwijtraakt.
const props = defineProps({
  count: { type: Number, required: true },
  // Voor de aria-labels: "Eén melk minder".
  name: { type: String, required: true },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['change'])

function change(count) {
  const next = Math.min(Math.max(count, 1), MAX_COUNT)
  if (next !== props.count) emit('change', next)
}
</script>

<template>
  <div class="stepper" :class="{ disabled }" role="group" :aria-label="`Aantal ${name}`">
    <button
      type="button"
      class="step down"
      :disabled="disabled || count <= 1"
      :aria-label="`Eén ${name} minder`"
      @click="change(count - 1)"
    >
      −
    </button>
    <!-- aria-live: een schermlezer leest het nieuwe aantal voor na − of +. -->
    <span class="value" aria-live="polite">{{ count }}</span>
    <button
      type="button"
      class="step up"
      :disabled="disabled || count >= MAX_COUNT"
      :aria-label="`Eén ${name} meer`"
      @click="change(count + 1)"
    >
      +
    </button>
  </div>
</template>

<style scoped>
/* Eén smal blokje: een pil met − n + erin. De knoppen zijn 44 px breed en hoog (de richtlijn
   van Apple voor aanraakvakken), maar de pil die je ziet is smaller: hij begint en eindigt
   een stukje binnen de knoppen (::before), zodat de buitenkant van elk tikvlak onzichtbaar
   buiten de pil valt. Het getal is gewone tekst zonder eigen kader. */
.stepper {
  --step: max(var(--tap), 44px);
  --inset: 10px;

  position: relative;
  display: flex;
  align-items: center;
}

.stepper::before {
  position: absolute;
  inset: 6px var(--inset);
  content: '';
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  pointer-events: none;
}

.step {
  position: relative;
  height: var(--step);
  min-height: var(--step);
  padding: 0;
  width: var(--step);
  min-width: var(--step);
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-accent-text);
  background: transparent;
  border-color: transparent;
}

/* Gewone tekst, net breed genoeg voor twee cijfers (99). */
.value {
  width: 2ch;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  text-align: center;
}

.step:disabled,
.disabled .value {
  opacity: 0.35;
}
</style>
