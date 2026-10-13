<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { fetchRecipe } from '@/api/recipes'
import { useAdminStore } from '@/stores/admin'
import { useShoppingListStore } from '@/stores/shoppingList'
import { formatQuantity, scaleQuantity } from '@/utils/quantity'

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
    servings.value = recipe.value.servings
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

// Porties: alleen het gekozen aantal is state; al het andere is daarvan
// afgeleid met computed. Bewust niet bewaard: het is een keuze voor één keer
// koken, en bij een volgend bezoek begin je weer bij het recept zelf.
const MIN_SERVINGS = 1
const MAX_SERVINGS = 50
const servings = ref(null)

const isOriginal = computed(() => servings.value === recipe.value?.servings)

function changeServings(delta) {
  const next = servings.value + delta
  servings.value = Math.min(MAX_SERVINGS, Math.max(MIN_SERVINGS, next))
}

function resetServings() {
  servings.value = recipe.value.servings
}

// Elke hoeveelheid × (gekozen / origineel), afgerond per eenheid.
// "Naar smaak" (null) blijft null. Rekent vanzelf opnieuw als servings verandert.
const scaledIngredients = computed(() => {
  const factor = servings.value / recipe.value.servings
  return (recipe.value.ingredients ?? []).map((ingredient) => ({
    ...ingredient,
    quantity: scaleQuantity(ingredient.quantity, factor, ingredient.unit),
  }))
})

// "200 g bloem", "2 stuks ei", "zout — naar smaak"; getallen als 0,5 in plaats van 0.5.
function ingredientLine(ingredient) {
  const name = ingredient.note ? `${ingredient.name}, ${ingredient.note}` : ingredient.name
  if (ingredient.quantity == null) return `${name} — naar smaak`

  return `${formatQuantity(ingredient.quantity)} ${ingredient.unit} ${name}`
}

// Boodschappenlijst: we voegen de geschaalde hoeveelheden toe, dus precies wat
// je op het scherm ziet.
const shoppingList = useShoppingListStore()
const addedMessage = ref(null)
let messageTimer = null

function confirmAdded(message) {
  addedMessage.value = message
  clearTimeout(messageTimer)
  messageTimer = setTimeout(() => (addedMessage.value = null), 3000)
}

onUnmounted(() => clearTimeout(messageTimer))

function addToList(ingredient) {
  shoppingList.add(ingredient, recipe.value)
  confirmAdded(`${ingredient.name} staat op je boodschappenlijst.`)
}

function addAllToList() {
  shoppingList.addIngredients(scaledIngredients.value, recipe.value)
  confirmAdded('Alle ingrediënten staan op je boodschappenlijst.')
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
    <div class="servings">
      <button
        type="button"
        aria-label="Minder porties"
        :disabled="servings <= MIN_SERVINGS"
        @click="changeServings(-1)"
      >
        −
      </button>
      <span class="servings-count">{{ servings }} {{ servings === 1 ? 'portie' : 'porties' }}</span>
      <button
        type="button"
        aria-label="Meer porties"
        :disabled="servings >= MAX_SERVINGS"
        @click="changeServings(1)"
      >
        +
      </button>
      <button v-if="!isOriginal" type="button" class="reset" @click="resetServings">
        Terug naar origineel ({{ recipe.servings }})
      </button>
    </div>
    <p v-if="recipe.description" class="description">{{ recipe.description }}</p>

    <!-- Oudere recepten hebben geen ingrediënten of stappen; dan vervalt het kopje. -->
    <section v-if="recipe.ingredients?.length" class="ingredients">
      <h2>Ingrediënten</h2>
      <ul>
        <li v-for="ingredient in scaledIngredients" :key="ingredient.id">
          <span class="line">{{ ingredientLine(ingredient) }}</span>
          <button
            type="button"
            class="add-one"
            :aria-label="`${ingredient.name} op boodschappenlijst`"
            @click="addToList(ingredient)"
          >
            + lijst
          </button>
        </li>
      </ul>
      <button type="button" class="add-all" @click="addAllToList">Alles op lijst</button>
      <p v-if="addedMessage" class="added" role="status">{{ addedMessage }}</p>
    </section>

    <section v-if="recipe.steps?.length" class="steps">
      <h2>Bereiding</h2>
      <ol>
        <li v-for="step in recipe.steps" :key="step.id">{{ step.body }}</li>
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
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  color: #666;
}

.servings button,
.ingredients button {
  font: inherit;
}

.servings-count {
  min-width: 6rem;
  text-align: center;
}

.ingredients li {
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 0.25rem;
}

.ingredients .add-one {
  flex-shrink: 0;
  font-size: 0.85rem;
}

.added {
  color: #060;
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
