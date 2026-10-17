<script setup>
import { vAutogrow } from '@/directives/autogrow'

// Eén stap van RecipeForm: de tekst, met omhoog, omlaag en verwijderen. De stap zelf
// (v-model:step) is een object uit de lijst van RecipeForm; verplaatsen en weghalen doet
// RecipeForm.
defineProps({
  // De plek in het formulier, vanaf 0 ("Stap 1").
  index: { type: Number, required: true },
  first: { type: Boolean, default: false },
  last: { type: Boolean, default: false },
  // De enige stap kan niet weg.
  removable: { type: Boolean, default: true },
  // Welke velden de server fout vond ({ body: true }) en zijn meldingen.
  invalid: { type: Object, default: () => ({}) },
  messages: { type: Array, default: () => [] },
})

const step = defineModel('step', { type: Object, required: true })

const emit = defineEmits(['up', 'down', 'remove'])
</script>

<template>
  <li class="row step-row" :data-key="step.key">
    <label :for="`step-${step.key}`">Stap {{ index + 1 }}</label>
    <textarea
      :id="`step-${step.key}`"
      v-model="step.body"
      v-autogrow
      rows="2"
      :aria-invalid="!!invalid.body"
    ></textarea>
    <div class="step-actions">
      <button
        type="button"
        class="up"
        :disabled="first"
        :aria-label="`Stap ${index + 1} omhoog`"
        @click="emit('up')"
      >
        ↑ omhoog
      </button>
      <button
        type="button"
        class="down"
        :disabled="last"
        :aria-label="`Stap ${index + 1} omlaag`"
        @click="emit('down')"
      >
        ↓ omlaag
      </button>
      <button
        type="button"
        class="remove btn-danger"
        :disabled="!removable"
        @click="emit('remove')"
      >
        verwijderen
      </button>
    </div>
    <p v-for="message in messages" :key="message" class="error">
      {{ message }}
    </p>
  </li>
</template>

<style scoped>
.row .error {
  margin-top: var(--space-1);
}

/* clear: onder de legend van RecipeForm (float: left). */
.row {
  clear: both;
  padding: var(--space-2) 0;
  border-bottom: 1px dashed var(--color-border);
}

.row:last-child {
  border-bottom: 0;
}

.step-row {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

/* Groeit mee met de tekst, vanaf 2 regels (zie ook vAutogrow voor oudere browsers). */
.step-row textarea {
  field-sizing: content;
  min-height: calc(2lh + 2 * var(--control-pad-y) + 2px);
  resize: none;
}

.step-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.step-actions .remove {
  margin-left: auto;
}

.step-actions button {
  font-size: var(--text-sm);
}
</style>
