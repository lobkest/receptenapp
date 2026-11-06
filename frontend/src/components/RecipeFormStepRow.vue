<script setup>
import { IconArrowDown, IconArrowUp, IconTrash } from '@tabler/icons-vue'
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
    <!-- Het groene bolletje is het label: zichtbaar alleen het nummer, voorgelezen
         "Stap 1". -->
    <label :for="`step-${step.key}`" class="step-number"
      ><span class="visually-hidden">Stap </span>{{ index + 1 }}</label
    >
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
        class="up btn-icon"
        :disabled="first"
        :aria-label="`Stap ${index + 1} omhoog`"
        @click="emit('up')"
      >
        <IconArrowUp :size="18" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="down btn-icon"
        :disabled="last"
        :aria-label="`Stap ${index + 1} omlaag`"
        @click="emit('down')"
      >
        <IconArrowDown :size="18" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="remove btn-icon"
        :disabled="!removable"
        :aria-label="`Stap ${index + 1} verwijderen`"
        @click="emit('remove')"
      >
        <IconTrash :size="18" aria-hidden="true" />
      </button>
    </div>
    <p v-for="message in messages" :key="message" class="error">
      {{ message }}
    </p>
  </li>
</template>

<style scoped>
.row .error {
  grid-column: 2;
  margin: 0;
}

/* Een stap is een gevuld blok in de sectie (SectionCard): links het nummer, rechts de
   tekst met de knoppen eronder. */
.row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--space-2);
  padding: var(--space-2);
  background: var(--color-row);
  border-radius: var(--radius);
}

/* Groen rond nummer, op de hoogte van de eerste tekstregel. */
.step-number {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  margin-top: calc(var(--control-pad-y) + 1px);
  font-size: var(--text-xs);
  font-weight: 700;
  line-height: 1;
  color: var(--color-on-brand);
  background: var(--color-brand);
  border-radius: 50%;
}

/* Groeit mee met de tekst, vanaf 2 regels (zie ook vAutogrow voor oudere browsers). */
.step-row textarea {
  field-sizing: content;
  min-height: calc(2lh + 2 * var(--control-pad-y) + 2px);
  resize: none;
}

.step-actions {
  grid-column: 2;
  display: flex;
  gap: var(--space-1);
  margin-top: calc(-1 * var(--space-1));
}

.step-actions button {
  color: var(--color-text-muted);
  background: transparent;
}

.step-actions button:hover:not(:disabled) {
  color: var(--color-accent-text);
  background: var(--color-brand-soft);
}

.step-actions .remove {
  margin-left: auto;
}

.step-actions .remove:hover:not(:disabled) {
  color: var(--color-danger);
  background: var(--color-danger-soft);
}
</style>
