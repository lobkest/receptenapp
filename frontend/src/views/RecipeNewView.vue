<script setup>
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import RecipeForm from '@/components/RecipeForm.vue'
import { createRecipe } from '@/api/recipes'

const errors = ref({})
const message = ref(null)
const submitting = ref(false)
const submitted = ref(false)

async function handleSubmit(recipe) {
  submitting.value = true
  errors.value = {}
  message.value = null
  try {
    await createRecipe(recipe)
    submitted.value = true
  } catch (e) {
    if (e.kind === 'validation') {
      errors.value = e.errors
    } else {
      // 429, netwerkfout of serverfout: de ApiError heeft al een Nederlandse melding.
      message.value = e.message
    }
  } finally {
    submitting.value = false
  }
}

function reset() {
  submitted.value = false
}
</script>

<template>
  <h1>Recept insturen</h1>

  <div v-if="submitted" class="card" role="status">
    <p>Bedankt! Je recept wacht op goedkeuring.</p>
    <p>
      <button type="button" class="btn-primary" @click="reset">Nog een recept insturen</button>
      of <RouterLink to="/">terug naar de recepten</RouterLink>.
    </p>
  </div>

  <template v-else>
    <p v-if="message" class="message notice notice-error" role="alert">{{ message }}</p>
    <RecipeForm :errors="errors" :submitting="submitting" @submit="handleSubmit" />
  </template>
</template>
