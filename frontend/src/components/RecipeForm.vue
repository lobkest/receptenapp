<script setup>
import { reactive } from 'vue'

// Props: data die de ouder (RecipeNewView) naar dit component stuurt.
defineProps({
  errors: { type: Object, default: () => ({}) },
  submitting: { type: Boolean, default: false },
})

// Emits: berichten die dit component terugstuurt naar de ouder.
const emit = defineEmits(['submit'])

// Geen eigen validatie: de server beslist wat geldig is.
const form = reactive({
  title: '',
  description: '',
  servings: 4,
})

function onSubmit() {
  emit('submit', { ...form })
}
</script>

<template>
  <form @submit.prevent="onSubmit">
    <div class="field">
      <label for="title">Titel</label>
      <input id="title" v-model="form.title" type="text" :aria-invalid="!!errors.title" />
      <p v-if="errors.title" class="error">Titel {{ errors.title.join(', ') }}</p>
    </div>

    <div class="field">
      <label for="description">Beschrijving</label>
      <textarea
        id="description"
        v-model="form.description"
        rows="6"
        :aria-invalid="!!errors.description"
      ></textarea>
      <p v-if="errors.description" class="error">
        Beschrijving {{ errors.description.join(', ') }}
      </p>
    </div>

    <div class="field">
      <label for="servings">Porties</label>
      <input
        id="servings"
        v-model.number="form.servings"
        type="number"
        :aria-invalid="!!errors.servings"
      />
      <p v-if="errors.servings" class="error">Porties {{ errors.servings.join(', ') }}</p>
    </div>

    <button type="submit" :disabled="submitting">
      {{ submitting ? 'Versturen…' : 'Recept insturen' }}
    </button>
  </form>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-bottom: 1rem;
}

input,
textarea {
  font: inherit;
  padding: 0.5rem;
  border: 1px solid #bbb;
  border-radius: 4px;
  width: 100%;
}

input[aria-invalid='true'],
textarea[aria-invalid='true'] {
  border-color: #c00;
}

.error {
  color: #c00;
  margin: 0;
  font-size: 0.9rem;
}

button {
  font: inherit;
  padding: 0.5rem 1rem;
}
</style>
