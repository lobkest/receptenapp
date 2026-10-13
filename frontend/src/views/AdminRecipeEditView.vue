<script setup>
import { ref, watch } from 'vue'
import { RouterLink, onBeforeRouteLeave, useRouter } from 'vue-router'
import RecipeForm from '@/components/RecipeForm.vue'
import { useAdminStore } from '@/stores/admin'

// Komt uit de route /beheer/recepten/:id/bewerken dankzij props: true.
const props = defineProps({
  id: { type: String, required: true },
})

const admin = useAdminStore()
const router = useRouter()

const recipe = ref(null)
const loading = ref(false)
const notFound = ref(false)
const loadError = ref(null)

const errors = ref({})
const message = ref(null)
const submitting = ref(false)
const dirty = ref(false)

async function load(id) {
  loading.value = true
  notFound.value = false
  loadError.value = null
  recipe.value = null
  try {
    // Via de admin-API, dus ook wachtende en afgewezen recepten.
    recipe.value = await admin.fetchRecipe(id)
  } catch (e) {
    if (e.kind === 'not_found') {
      notFound.value = true
    } else if (e.kind !== 'unauthorized') {
      loadError.value = e.message
    }
  } finally {
    loading.value = false
  }
}

async function handleSubmit(values) {
  submitting.value = true
  errors.value = {}
  message.value = null
  try {
    // Alleen deze drie velden; de status wijzigt alleen via goedkeuren/afwijzen.
    const { title, description, servings } = values
    await admin.updateRecipe(props.id, { title, description, servings })
    dirty.value = false
    admin.setFlash(`"${title}" is opgeslagen.`)
    router.push({ name: 'admin' })
  } catch (e) {
    if (e.kind === 'validation') {
      errors.value = e.errors
    } else if (e.kind !== 'unauthorized') {
      message.value = e.message
    }
  } finally {
    submitting.value = false
  }
}

// Waarschuw bij weggaan met niet-opgeslagen wijzigingen.
// Return false annuleert de navigatie.
onBeforeRouteLeave(() => {
  if (dirty.value && admin.isLoggedIn) {
    return window.confirm('Je hebt niet-opgeslagen wijzigingen. Toch weggaan?')
  }
})

// Bij een 401 logt de store uit; dan heeft deze pagina geen zin meer.
watch(
  () => admin.isLoggedIn,
  (loggedIn) => {
    if (!loggedIn) {
      admin.setFlash('Je code is niet (meer) geldig. Log opnieuw in.')
      router.replace({ name: 'admin' })
    }
  },
)

watch(() => props.id, load, { immediate: true })
</script>

<template>
  <h1>Recept bewerken</h1>

  <p v-if="loading">Recept laden…</p>

  <p v-else-if="notFound">Dit recept bestaat niet (meer).</p>

  <p v-else-if="loadError" role="alert">{{ loadError }}</p>

  <template v-else-if="recipe">
    <p v-if="message" class="message" role="alert">{{ message }}</p>
    <!-- :key zorgt dat het formulier opnieuw begint bij een ander recept.
         :rows="false": ingrediënten en stappen bewerken in beheer komt in een latere stap. -->
    <RecipeForm
      :key="recipe.id"
      :initial="recipe"
      :errors="errors"
      :submitting="submitting"
      submit-label="Opslaan"
      :rows="false"
      @submit="handleSubmit"
      @dirty-change="dirty = $event"
    />
  </template>

  <p><RouterLink to="/beheer">← Terug naar beheer</RouterLink></p>
</template>

<style scoped>
.message {
  padding: 0.75rem;
  background: #fdecea;
  color: #900;
  border-radius: 4px;
}
</style>
