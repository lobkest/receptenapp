<script setup>
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { requestDeletion } from '@/api/recipes'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { useAdminStore } from '@/stores/admin'
import { useRecipesStore } from '@/stores/recipes'

// Onder het recept: bewerken en verwijderen (aanvragen) voor iedereen, versies alleen
// voor de beheerder.
const props = defineProps({
  // { id, title }
  recipe: { type: Object, required: true },
})

const router = useRouter()
// Gedeelde staat: de melding op het overzicht na verwijderen, en of je beheerder bent.
const recipes = useRecipesStore()
const admin = useAdminStore()
const { askWithInput } = useConfirmDialog()

// Verwijderen kan iedereen aanvragen. Het recept is dan meteen verborgen; de beheerder
// beslist of het definitief weg gaat of terugkomt.
const deleting = ref(false)
const deleteError = ref(null)

async function askDeletion() {
  const title = props.recipe.title
  const reason = await askWithInput({
    title: `"${title}" verwijderen?`,
    text: 'Het recept verdwijnt meteen uit het overzicht. De beheerder kan het nog terugzetten.',
    inputLabel: 'Reden (optioneel)',
  })
  if (reason === null) return

  deleting.value = true
  deleteError.value = null
  try {
    await requestDeletion(props.recipe.id, reason)
    recipes.setNotice(`"${title}" is verwijderd.`)
    recipes.loadTags()
    router.push({ name: 'recipes' })
  } catch (e) {
    deleteError.value = e.message
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="recipe-actions">
    <RouterLink :to="{ name: 'recipe-edit', params: { id: recipe.id } }" class="btn edit">
      Bewerken
    </RouterLink>
    <RouterLink
      v-if="admin.isLoggedIn"
      :to="{ name: 'admin-recipe-versions', params: { id: recipe.id } }"
      class="btn versions"
    >
      Versies
    </RouterLink>
    <button type="button" class="btn-danger delete" :disabled="deleting" @click="askDeletion">
      Verwijderen
    </button>
    <p v-if="deleteError" class="error" role="alert">{{ deleteError }}</p>
  </div>
</template>

<style scoped>
.recipe-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
  margin-top: var(--space-5);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border);
}
</style>
