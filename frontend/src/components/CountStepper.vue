<script setup>
import { ref, useTemplateRef } from 'vue'
import { MAX_COUNT } from '@/utils/shoppingListLine'

// Het aantal van een regel op de boodschappenlijst: [−] 2 [+]. Het getal is een invoerveld:
// tik erop om te typen; Enter of ergens anders tikken slaat op, Escape laat het zoals het was. Het
// component bewaart zelf niets: het meldt een nieuw aantal (change) en toont wat count zegt.
// Bij 1 kan − niet: weghalen gaat alleen met het ✕ ernaast, zodat je niet per ongeluk een
// regel kwijtraakt.
const props = defineProps({
  count: { type: Number, required: true },
  // Voor de aria-labels: "Eén melk minder".
  name: { type: String, required: true },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['change'])

// Tijdens het typen staat in het veld wat je typt (draft); anders het aantal.
const editing = ref(false)
const draft = ref('')
const input = useTemplateRef('input')

function change(count) {
  const next = Math.min(Math.max(count, 1), MAX_COUNT)
  if (next !== props.count) emit('change', next)
}

// Een tik in het veld: het getal staat geselecteerd, zodat je meteen overtypt.
function startEditing() {
  draft.value = String(props.count)
  editing.value = true
  input.value.select()
}

// Alleen hele getallen; 0 wordt 1 en meer dan 99 wordt 99. Leeg of geen getal: niets.
function commit() {
  if (!editing.value) return
  editing.value = false
  const text = draft.value.trim()
  if (/^\d+$/.test(text)) change(Number(text))
}

function finish() {
  input.value.blur()
}

function cancel() {
  editing.value = false
  input.value.blur()
}
</script>

<template>
  <div class="stepper" role="group" :aria-label="`Aantal ${name}`">
    <button
      type="button"
      class="step down"
      :disabled="disabled || count <= 1"
      :aria-label="`Eén ${name} minder`"
      @click="change(count - 1)"
    >
      −
    </button>
    <input
      ref="input"
      class="value"
      type="text"
      inputmode="numeric"
      pattern="[0-9]*"
      maxlength="2"
      enterkeyhint="done"
      :value="editing ? draft : count"
      :disabled="disabled"
      :aria-label="`Aantal ${name}`"
      @focus="startEditing"
      @input="draft = $event.target.value"
      @keydown.enter.prevent="finish"
      @keydown.esc.prevent="cancel"
      @blur="commit"
    />
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
/* Minstens 44×44 per knop (de richtlijn van Apple voor aanraakvakken), ook het getal. */
.stepper {
  --step: max(var(--tap), 44px);

  display: flex;
  align-items: center;
}

.step,
.value {
  width: var(--step);
  min-width: var(--step);
  height: var(--step);
  min-height: var(--step);
  padding: 0;
}

.step {
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--color-accent-text);
  background: transparent;
  border-color: transparent;
}

.value {
  font-variant-numeric: tabular-nums;
  text-align: center;
  background: transparent;
  border-color: var(--color-border);
}

/* De lettergrootte blijft --text-input (16px, uit main.css), anders zoomt iOS in zodra je
   erin tikt. Tijdens het typen een groene rand. */
.value:focus {
  border-color: var(--color-brand);
}

.step:disabled,
.value:disabled {
  opacity: 0.35;
}
</style>
