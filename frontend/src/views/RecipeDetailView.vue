<script setup>
import { ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { fetchRecipe } from '@/api/recipes'

// Komt uit de route /recepten/:id dankzij props: true in de router.
const props = defineProps({
  id: { type: String, required: true },
})

const recipe = ref(null)
const loading = ref(false)
const notFound = ref(false)
const error = ref(null)

async function load(id) {
  loading.value = true
  notFound.value = false
  error.value = null
  recipe.value = null
  try {
    recipe.value = await fetchRecipe(id)
  } catch (e) {
    if (e.kind === 'not_found') {
      notFound.value = true
    } else {
      error.value = e.message
    }
  } finally {
    loading.value = false
  }
}

// Van /recepten/1 naar /recepten/2 hergebruikt Vue hetzelfde component,
// dus onMounted draait niet opnieuw. Daarom kijken we naar het id zelf.
watch(() => props.id, load, { immediate: true })
</script>

<template>
  <p v-if="loading">Recept laden…</p>

  <div v-else-if="notFound">
    <h1>Recept niet gevonden</h1>
    <p>Dit recept bestaat niet of is nog niet goedgekeurd.</p>
  </div>

  <p v-else-if="error" role="alert">{{ error }}</p>

  <article v-else-if="recipe">
    <h1>{{ recipe.title }}</h1>
    <p class="servings">{{ recipe.servings }} {{ recipe.servings === 1 ? 'portie' : 'porties' }}</p>
    <p v-if="recipe.description" class="description">{{ recipe.description }}</p>
  </article>

  <p><RouterLink to="/">← Terug naar alle recepten</RouterLink></p>
</template>

<style scoped>
.servings {
  color: #666;
}

/* Behoud enters uit de beschrijving. */
.description {
  white-space: pre-line;
}
</style>
