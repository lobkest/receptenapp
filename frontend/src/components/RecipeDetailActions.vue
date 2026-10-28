<script setup>
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { requestDeletion } from '@/api/recipes'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { useTimedMessage } from '@/composables/useTimedMessage'
import { useAdminStore } from '@/stores/admin'
import { useRecipesStore } from '@/stores/recipes'
import { recipeText } from '@/utils/recipeText'
import { shareText } from '@/utils/share'

// Onder het recept: bewerken, delen en verwijderen (aanvragen) voor iedereen, versies
// alleen voor de beheerder.
const props = defineProps({
  // Het recept zoals de API het stuurt; voor delen is alles nodig, niet alleen { id, title }.
  recipe: { type: Object, required: true },
  // Het gekozen aantal porties en de gewisselde ingrediënten: je deelt wat je ziet.
  servings: { type: Number, default: null },
  swaps: { type: Object, default: () => ({}) },
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

// Delen als tekst, zonder link naar de app (utils/recipeText.js). Het deelmenu laat zelf
// zien dat het gelukt is; alleen bij kopiëren een melding.
const sharing = ref(false)
const shareError = ref(null)
const { message: shareMessage, show: showShareMessage, hide: hideShareMessage } = useTimedMessage()

async function share() {
  sharing.value = true
  shareError.value = null
  hideShareMessage()
  try {
    const text = recipeText(props.recipe, {
      servings: props.servings ?? props.recipe.servings,
      swaps: props.swaps,
    })
    if ((await shareText(props.recipe.title, text)) === 'copied') {
      showShareMessage('Recept gekopieerd. Plak het waar je wilt.')
    }
  } catch (e) {
    shareError.value = e.message
  } finally {
    sharing.value = false
  }
}

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
    <button type="button" class="btn share" :disabled="sharing" @click="share">Delen</button>
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
    <p v-if="shareMessage" class="share-message notice notice-success" role="status">
      {{ shareMessage }}
    </p>
    <p v-if="shareError" class="error" role="alert">{{ shareError }}</p>
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

/* De melding onder de knoppen, niet ertussen. */
.share-message {
  flex-basis: 100%;
  margin: 0;
}
</style>
