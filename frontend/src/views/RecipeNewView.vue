<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import RecipeForm from '@/components/RecipeForm.vue'
import { createRecipe } from '@/api/recipes'
import { useRecipesStore } from '@/stores/recipes'

const router = useRouter()
// De bestaande tags en categorieën voor het formulier, en de melding op de receptpagina.
const recipes = useRecipesStore()
onMounted(() => {
  recipes.loadTags()
  recipes.loadCategories()
})

const errors = ref({})
const message = ref(null)
const submitting = ref(false)

// Een nieuw recept is meteen zichtbaar: we gaan direct naar de receptpagina.
async function handleSubmit(values) {
  submitting.value = true
  errors.value = {}
  message.value = null
  try {
    const recipe = await createRecipe(values)
    recipes.setNotice(`"${recipe.title}" is toegevoegd.`)
    router.push({ name: 'recipe', params: { id: recipe.id } })
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
</script>

<template>
  <h1>Recept toevoegen</h1>

  <p v-if="message" class="message notice notice-error" role="alert">{{ message }}</p>
  <RecipeForm
    :errors="errors"
    :submitting="submitting"
    :available-tags="recipes.tagNames"
    :available-categories="recipes.categories"
    @submit="handleSubmit"
  />
</template>
