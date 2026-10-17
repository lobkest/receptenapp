<script setup>
import { ref } from 'vue'
import { updateIngredientStaple } from '@/api/ingredients'

// "Basis" op het bewerkscherm van een ingrediënt (voor "In huis"). Ook los van het
// NEVO-formulier: meteen opgeslagen, zonder lock_version (de laatste wint).
const props = defineProps({
  ingredient: { type: Object, required: true },
})

// Na opslaan: de nieuwe waarde (true of false).
const emit = defineEmits(['saved'])

const stapleError = ref(null)
const stapleMessage = ref(null)
const stapleSaving = ref(false)

async function onStapleToggle(event) {
  const staple = event.target.checked
  stapleError.value = null
  stapleMessage.value = null
  stapleSaving.value = true
  try {
    const result = await updateIngredientStaple(props.ingredient.id, staple)
    emit('saved', result.staple)
    stapleMessage.value = result.staple ? 'Staat nu in de basis.' : 'Niet meer in de basis.'
  } catch (e) {
    event.target.checked = props.ingredient.staple
    stapleError.value = e.message
  } finally {
    stapleSaving.value = false
  }
}
</script>

<template>
  <section class="card section staple">
    <label class="check">
      <input
        id="staple"
        type="checkbox"
        :checked="ingredient.staple"
        :disabled="stapleSaving"
        @change="onStapleToggle"
      />
      <span>
        <strong>Basis</strong><br />
        <span class="muted small">
          Heb je meestal in huis, zoals zout of olijfolie. Telt op "In huis" mee, tenzij je zegt dat
          het op is. Wordt meteen opgeslagen.
        </span>
      </span>
    </label>
    <p v-if="stapleError" class="error" role="alert">{{ stapleError }}</p>
    <p v-else-if="stapleMessage" class="muted small" role="status">{{ stapleMessage }}</p>
  </section>
</template>

<style scoped>
/* Zoals de andere secties van het bewerkscherm (IngredientEditView). */
.section {
  margin-bottom: var(--space-4);
}

.section p {
  margin-bottom: var(--space-2);
}

.small {
  font-size: var(--text-sm);
}

.staple .check {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  min-height: var(--tap);
  font-weight: 400;
  cursor: pointer;
}

.staple input {
  flex-shrink: 0;
  margin-top: 0.15rem;
}
</style>
