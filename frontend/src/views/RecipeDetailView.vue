<script setup>
import { ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { fetchRecipe } from '@/api/recipes'
import { useAdminStore } from '@/stores/admin'

// Komt uit de route /recepten/:id dankzij props: true in de router.
const props = defineProps({
  id: { type: String, required: true },
})

const recipe = ref(null)
const loading = ref(false)
const notFound = ref(false)
const error = ref(null)

// Alleen voor de beheerder: bewerken en verwijderen vanaf deze pagina.
const admin = useAdminStore()
const router = useRouter()
const deleting = ref(false)
const deleteError = ref(null)

async function destroy() {
  const title = recipe.value.title
  const sure = window.confirm(
    `"${title}" definitief verwijderen? Dit kan niet ongedaan worden gemaakt.`,
  )
  if (!sure) return

  deleting.value = true
  deleteError.value = null
  try {
    await admin.destroy(recipe.value.id)
    admin.setFlash(`"${title}" is verwijderd.`)
    router.push({ name: 'admin' })
  } catch (e) {
    deleteError.value = e.message
  } finally {
    deleting.value = false
  }
}

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

// "200 g bloem", "2 stuks ei", "zout — naar smaak"; getallen als 0,5 in plaats van 0.5.
const numberFormat = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 2 })

function ingredientLine(ingredient) {
  const name = ingredient.note ? `${ingredient.name}, ${ingredient.note}` : ingredient.name
  if (ingredient.quantity == null) return `${name} — naar smaak`

  return `${numberFormat.format(ingredient.quantity)} ${ingredient.unit} ${name}`
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

    <!-- Oudere recepten hebben geen ingrediënten of stappen; dan vervalt het kopje. -->
    <section v-if="recipe.ingredients?.length" class="ingredients">
      <h2>Ingrediënten</h2>
      <ul>
        <li v-for="ingredient in recipe.ingredients" :key="ingredient.name">
          {{ ingredientLine(ingredient) }}
        </li>
      </ul>
    </section>

    <section v-if="recipe.steps?.length" class="steps">
      <h2>Bereiding</h2>
      <ol>
        <li v-for="step in recipe.steps" :key="step.position">{{ step.body }}</li>
      </ol>
    </section>

    <div v-if="admin.isLoggedIn" class="admin-actions">
      <RouterLink :to="`/beheer/recepten/${recipe.id}/bewerken`">Bewerken</RouterLink>
      <button type="button" :disabled="deleting" @click="destroy">Verwijderen</button>
      <p v-if="deleteError" class="error" role="alert">{{ deleteError }}</p>
    </div>
  </article>

  <p><RouterLink to="/">← Terug naar alle recepten</RouterLink></p>
</template>

<style scoped>
.servings {
  color: #666;
}

.admin-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  padding-top: 0.75rem;
  border-top: 1px solid #eee;
}

.admin-actions button {
  font: inherit;
  color: #c00;
}

.error {
  color: #c00;
}

/* Behoud enters uit de beschrijving en de stappen. */
.description,
.steps li {
  white-space: pre-line;
}

.steps li {
  margin-bottom: 0.5rem;
}
</style>
