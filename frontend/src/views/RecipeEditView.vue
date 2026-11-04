<script setup>
import { onMounted, ref, watch } from 'vue'
import { RouterLink, onBeforeRouteLeave, useRouter } from 'vue-router'
import OfflineNotice from '@/components/OfflineNotice.vue'
import RecipeForm from '@/components/RecipeForm.vue'
import { fetchRecipe, updateRecipe } from '@/api/recipes'
import { useRecipesStore } from '@/stores/recipes'
import { useServerStatusStore } from '@/stores/serverStatus'

// Iedereen mag bewerken. Komt uit de route /recepten/:id/bewerken dankzij props: true.
const props = defineProps({
  id: { type: String, required: true },
})

const router = useRouter()
// Offline: de melding bovenaan; het formulier blijft staan, opslaan staat uit (RecipeForm
// met offline).
const server = useServerStatusStore()
// De bestaande tags en categorieën voor het formulier, en de melding op de receptpagina
// na opslaan.
const recipes = useRecipesStore()
onMounted(() => {
  recipes.loadTags()
  recipes.loadCategories()
})

const recipe = ref(null)
const loading = ref(false)
const notFound = ref(false)
const loadError = ref(null)

const errors = ref({})
const message = ref(null)
// true na een 409: iemand anders was je voor. Dan kun je hier het recept herladen.
const conflict = ref(false)
const submitting = ref(false)
const dirty = ref(false)

async function load(id) {
  loading.value = true
  notFound.value = false
  loadError.value = null
  conflict.value = false
  message.value = null
  errors.value = {}
  recipe.value = null
  try {
    recipe.value = await fetchRecipe(id)
  } catch (e) {
    if (e.kind === 'not_found') {
      notFound.value = true
    } else {
      loadError.value = e.message
    }
  } finally {
    loading.value = false
  }
}

// values komt rechtstreeks uit RecipeForm. lock_version is het versienummer van het
// recept zoals je het laadde: is het intussen door iemand anders opgeslagen, dan
// weigert de server (409) en blijven jouw wijzigingen in het formulier staan.
async function handleSubmit(values) {
  submitting.value = true
  errors.value = {}
  message.value = null
  conflict.value = false
  try {
    await updateRecipe(props.id, { ...values, lock_version: recipe.value.lock_version })
    dirty.value = false
    recipes.setNotice(`"${values.title}" is opgeslagen.`)
    router.push({ name: 'recipe', params: { id: props.id } })
  } catch (e) {
    if (e.kind === 'validation') {
      errors.value = e.errors
    } else {
      conflict.value = e.kind === 'conflict'
      message.value = e.message
    }
  } finally {
    submitting.value = false
  }
}

// Herladen na een conflict: de nieuwste versie, jouw niet-opgeslagen wijzigingen vervallen.
function reload() {
  const sure =
    !dirty.value ||
    window.confirm('Je niet-opgeslagen wijzigingen gaan verloren. Toch de nieuwste versie laden?')
  if (!sure) return
  dirty.value = false
  load(props.id)
}

// Waarschuw bij weggaan met niet-opgeslagen wijzigingen.
// Return false annuleert de navigatie.
onBeforeRouteLeave(() => {
  if (dirty.value) {
    return window.confirm('Je hebt niet-opgeslagen wijzigingen. Toch weggaan?')
  }
})

watch(() => props.id, load, { immediate: true })

// Lukte laden niet (offline geopend)? Dan opnieuw zodra de server er weer is.
watch(
  () => server.online,
  (online) => online && loadError.value && load(props.id),
)
</script>

<template>
  <OfflineNotice v-if="server.offline" editing />

  <h1>Recept bewerken</h1>

  <p v-if="loading" class="muted">Recept laden…</p>

  <p v-else-if="notFound">Dit recept bestaat niet (meer).</p>

  <!-- Offline geopend: de offline-melding zegt het al; zodra er verbinding is, laden we opnieuw. -->
  <p v-else-if="loadError && !server.offline" class="notice notice-error" role="alert">
    {{ loadError }}
  </p>

  <template v-else-if="recipe">
    <div v-if="message" class="message notice notice-error" role="alert">
      <p>{{ message }}</p>
      <button v-if="conflict" type="button" class="reload" @click="reload">
        Nieuwste versie laden
      </button>
    </div>
    <!-- :key met lock_version: na herladen begint het formulier opnieuw. -->
    <RecipeForm
      :key="`${recipe.id}-${recipe.lock_version}`"
      :initial="recipe"
      :errors="errors"
      :submitting="submitting"
      :offline="server.offline"
      :available-tags="recipes.manualTagNames"
      :reserved-tags="recipes.automaticTagNames"
      :available-categories="recipes.categories"
      submit-label="Opslaan"
      @submit="handleSubmit"
      @dirty-change="dirty = $event"
    />
  </template>

  <p>
    <RouterLink :to="{ name: 'recipe', params: { id } }" class="back-link">
      ← Terug naar het recept
    </RouterLink>
  </p>
</template>

<style scoped>
.message p {
  margin-bottom: var(--space-2);
}

.message p:last-child {
  margin-bottom: 0;
}
</style>
