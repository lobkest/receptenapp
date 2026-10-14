<script setup>
import { computed, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import VariationCard from '@/components/VariationCard.vue'
import VariationForm from '@/components/VariationForm.vue'
import { fetchRecipe, requestDeletion } from '@/api/recipes'
import { createVariation, requestVariationDeletion, updateVariation } from '@/api/variations'
import { useAdminStore } from '@/stores/admin'
import { useRecipesStore } from '@/stores/recipes'
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

const router = useRouter()
const recipes = useRecipesStore()
// Alleen voor de beheerder: een link naar de versies.
const admin = useAdminStore()
// Een melding van de vorige pagina, bijv. "… is opgeslagen." na bewerken.
const notice = ref(recipes.takeNotice())

// Verwijderen kan iedereen aanvragen. Het recept is dan meteen verborgen; de beheerder
// beslist of het definitief weg gaat of terugkomt.
const confirmDialog = useTemplateRef('confirmDialog')
const deleting = ref(false)
const deleteError = ref(null)

async function askDeletion() {
  const title = recipe.value.title
  const reason = await confirmDialog.value.askWithInput({
    title: `"${title}" verwijderen?`,
    text: 'Het recept verdwijnt meteen uit het overzicht. De beheerder kan het nog terugzetten.',
    inputLabel: 'Reden (optioneel)',
  })
  if (reason === null) return

  deleting.value = true
  deleteError.value = null
  try {
    await requestDeletion(recipe.value.id, reason)
    recipes.setNotice(`"${title}" is verwijderd.`)
    recipes.loadTags()
    router.push({ name: 'recipes' })
  } catch (e) {
    deleteError.value = e.message
  } finally {
    deleting.value = false
  }
}

// keepServings: na herladen (bijv. na een conflict) blijft de gekozen porties staan.
async function load(id, { keepServings = false } = {}) {
  const chosen = servings.value
  loading.value = true
  notFound.value = false
  error.value = null
  recipe.value = null
  closeVariationForms()
  try {
    recipe.value = await fetchRecipe(id)
    servings.value = keepServings && chosen ? chosen : recipe.value.servings
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
  if (ingredient.quantity == null) return `${ingredient.name} — naar smaak`

  return `${formatQuantity(ingredient.quantity)} ${ingredient.unit} ${ingredient.name}`
}

// Boodschappenlijst: we voegen de geschaalde hoeveelheden toe, dus precies wat
// je op het scherm ziet. De lijst staat op de server, dus dit kan mislukken.
const shoppingList = useShoppingListStore()
const addedMessage = ref(null)
const addError = ref(null)
let messageTimer = null

function confirmAdded(message) {
  addedMessage.value = message
  clearTimeout(messageTimer)
  messageTimer = setTimeout(() => (addedMessage.value = null), 3000)
}

onUnmounted(() => clearTimeout(messageTimer))

async function addIngredients(ingredients, message) {
  addError.value = null
  try {
    await shoppingList.addIngredients(ingredients, {
      label: recipe.value.title,
      recipeId: recipe.value.id,
    })
    confirmAdded(message)
  } catch (e) {
    addedMessage.value = null
    addError.value = e.message
  }
}

function addToList(ingredient) {
  addIngredients([ingredient], `${ingredient.name} staat op je boodschappenlijst.`)
}

// Optionele ingrediënten slaan we over: die zet je los op de lijst met "+ lijst".
function addAllToList() {
  const required = scaledIngredients.value.filter((ingredient) => !ingredient.optional)
  addIngredients(
    required,
    required.length < scaledIngredients.value.length
      ? 'Alle ingrediënten staan op je boodschappenlijst, behalve de optionele.'
      : 'Alle ingrediënten staan op je boodschappenlijst.',
  )
}

// ---------- Variaties ----------
// De kaarten tonen de verschillen met het basisrecept; het formulier klapt open op de
// pagina, voor een nieuwe variatie onder de kaarten, bij bewerken op de plek van de kaart.
// De bestaande tags zijn nodig voor "Tag erbij".
onMounted(() => recipes.loadTags())

const variations = computed(() => recipe.value?.variations ?? [])
const factor = computed(() => servings.value / recipe.value.servings)
const adding = ref(false)
const editingId = ref(null)
const variationErrors = ref({})
const variationMessage = ref(null)
const variationError = ref(null)
// true na een 409: dan kun je hier de nieuwste versie laden.
const variationConflict = ref(false)
const savingVariation = ref(false)
// id van de variatie waarvoor een actie loopt; die knoppen zijn dan uitgeschakeld.
const busyVariationId = ref(null)

function resetVariationFeedback() {
  variationErrors.value = {}
  variationMessage.value = null
  variationError.value = null
  variationConflict.value = false
}

function closeVariationForms() {
  adding.value = false
  editingId.value = null
}

function startAdding() {
  resetVariationFeedback()
  editingId.value = null
  adding.value = true
}

function startEditing(variation) {
  resetVariationFeedback()
  adding.value = false
  editingId.value = variation.id
}

function cancelVariation() {
  resetVariationFeedback()
  closeVariationForms()
}

// Een 422 toont de fouten in het formulier; al het andere als melding erboven.
function showVariationError(e) {
  if (e.kind === 'validation') {
    variationErrors.value = e.errors
  } else {
    variationConflict.value = e.kind === 'conflict'
    variationError.value = e.message
  }
}

async function saveVariation(body) {
  savingVariation.value = true
  resetVariationFeedback()
  try {
    if (editingId.value) {
      const current = variations.value.find((v) => v.id === editingId.value)
      const saved = await updateVariation(recipe.value.id, current.id, {
        ...body,
        lock_version: current.lock_version,
      })
      recipe.value.variations = variations.value.map((v) => (v.id === saved.id ? saved : v))
      variationMessage.value = `"${saved.name}" is opgeslagen.`
    } else {
      const saved = await createVariation(recipe.value.id, body)
      recipe.value.variations = [...variations.value, saved]
      variationMessage.value = `"${saved.name}" is toegevoegd.`
    }
    closeVariationForms()
    // Een nieuwe tag ("Tag erbij") staat daarna ook in de keuzelijst.
    recipes.loadTags()
  } catch (e) {
    showVariationError(e)
  } finally {
    savingVariation.value = false
  }
}

// Na een conflict: de variaties zoals ze nu op de server staan; jouw wijzigingen vervallen.
function reloadAfterConflict() {
  resetVariationFeedback()
  load(props.id, { keepServings: true })
}

// Wat op het scherm staat: het gekozen aantal porties. De server rekent de regels uit.
async function addVariationToList(variation) {
  busyVariationId.value = variation.id
  resetVariationFeedback()
  try {
    await shoppingList.addVariation(recipe.value.id, variation.id, servings.value)
    variationMessage.value = `"${variation.name}" staat op je boodschappenlijst.`
  } catch (e) {
    variationError.value = e.message
  } finally {
    busyVariationId.value = null
  }
}

async function askVariationDeletion(variation) {
  const reason = await confirmDialog.value.askWithInput({
    title: `"${variation.name}" verwijderen?`,
    text: 'De variatie verdwijnt meteen van deze pagina. De beheerder kan haar nog terugzetten.',
    inputLabel: 'Reden (optioneel)',
  })
  if (reason === null) return

  busyVariationId.value = variation.id
  resetVariationFeedback()
  try {
    await requestVariationDeletion(recipe.value.id, variation.id, reason)
    recipe.value.variations = variations.value.filter((v) => v.id !== variation.id)
    variationMessage.value = `"${variation.name}" is verwijderd.`
  } catch (e) {
    variationError.value = e.message
  } finally {
    busyVariationId.value = null
  }
}

// Van /recepten/1 naar /recepten/2 hergebruikt Vue hetzelfde component,
// dus onMounted draait niet opnieuw. Daarom kijken we naar het id zelf.
watch(() => props.id, load, { immediate: true })
</script>

<template>
  <p v-if="loading" class="muted">Recept laden…</p>

  <div v-else-if="notFound">
    <h1>Recept niet gevonden</h1>
    <p>Dit recept bestaat niet (meer).</p>
  </div>

  <p v-else-if="error" class="notice notice-error" role="alert">{{ error }}</p>

  <article v-else-if="recipe">
    <p v-if="notice" class="notice notice-success" role="status">{{ notice }}</p>
    <h1>{{ recipe.title }}</h1>
    <ul v-if="recipe.tags?.length" class="recipe-tags" aria-label="Tags">
      <li v-for="tag in recipe.tags" :key="tag" class="tag">{{ tag }}</li>
    </ul>
    <div class="servings">
      <button
        type="button"
        class="round"
        aria-label="Minder porties"
        :disabled="servings <= MIN_SERVINGS"
        @click="changeServings(-1)"
      >
        −
      </button>
      <span class="servings-count">{{ servings }} {{ servings === 1 ? 'portie' : 'porties' }}</span>
      <button
        type="button"
        class="round"
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
    <section v-if="recipe.ingredients?.length" class="ingredients card">
      <h2>Ingrediënten</h2>
      <ul>
        <li v-for="ingredient in scaledIngredients" :key="ingredient.id">
          <span class="line">
            {{ ingredientLine(ingredient) }}
            <span v-if="ingredient.optional" class="optional muted">(optioneel)</span>
          </span>
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
      <button type="button" class="add-all btn-primary btn-block" @click="addAllToList">
        Alles op lijst
      </button>
      <p v-if="addedMessage" class="added notice notice-success" role="status">
        {{ addedMessage }}
      </p>
      <p v-if="addError" class="added notice notice-error" role="alert">{{ addError }}</p>
    </section>

    <section v-if="recipe.steps?.length" class="steps">
      <h2>Bereiding</h2>
      <ol>
        <li v-for="step in recipe.steps" :key="step.id">{{ step.body }}</li>
      </ol>
    </section>

    <section class="variations">
      <h2>Variaties</h2>
      <p v-if="variationMessage" class="notice notice-success" role="status">
        {{ variationMessage }}
      </p>
      <div v-if="variationError" class="notice notice-error" role="alert">
        <p>{{ variationError }}</p>
        <button v-if="variationConflict" type="button" @click="reloadAfterConflict">
          Nieuwste versie laden
        </button>
      </div>

      <p v-if="variations.length === 0 && !adding" class="muted">Nog geen variaties.</p>

      <!-- Twee kolommen; een variatie die je bewerkt krijgt de hele breedte. -->
      <div v-if="variations.length" class="variation-grid">
        <template v-for="variation in variations" :key="variation.id">
          <VariationForm
            v-if="editingId === variation.id"
            class="wide"
            :initial="variation"
            :base-ingredients="recipe.ingredients ?? []"
            :base-tags="recipe.tags ?? []"
            :available-tags="recipes.tagNames"
            :errors="variationErrors"
            :submitting="savingVariation"
            @submit="saveVariation"
            @cancel="cancelVariation"
          />
          <VariationCard
            v-else
            :variation="variation"
            :factor="factor"
            :busy="busyVariationId === variation.id"
            @add-to-list="addVariationToList"
            @edit="startEditing"
            @delete="askVariationDeletion"
          />
        </template>
      </div>

      <VariationForm
        v-if="adding"
        class="new-variation"
        :base-ingredients="recipe.ingredients ?? []"
        :base-tags="recipe.tags ?? []"
        :available-tags="recipes.tagNames"
        :errors="variationErrors"
        :submitting="savingVariation"
        submit-label="Variatie toevoegen"
        @submit="saveVariation"
        @cancel="cancelVariation"
      />
      <button v-else type="button" class="add-variation" @click="startAdding">
        Voeg variatie toe
      </button>
    </section>

    <!-- Voor iedereen: bewerken en verwijderen (aanvragen). Versies alleen voor de beheerder. -->
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
  </article>

  <ConfirmDialog ref="confirmDialog" />

  <p><RouterLink to="/" class="back-link">← Terug naar alle recepten</RouterLink></p>
</template>

<style scoped>
.servings {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
  margin-bottom: var(--space-4);
}

.round {
  width: var(--tap);
  padding: 0;
  font-size: var(--text-lg);
  border-radius: var(--radius-full);
}

.servings-count {
  min-width: 6rem;
  font-weight: 600;
  text-align: center;
}

.reset {
  font-size: var(--text-sm);
}

/* Behoud enters uit de beschrijving en de stappen. */
.description,
.steps li {
  white-space: pre-line;
}

.description {
  font-size: var(--text-lg);
  color: var(--color-text-muted);
}

.ingredients {
  margin-bottom: var(--space-6);
}

.ingredients ul {
  margin: 0 0 var(--space-4);
  padding: 0;
  list-style: none;
}

.ingredients li {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  justify-content: space-between;
  padding: var(--space-1) 0;
  border-bottom: 1px solid var(--color-border);
}

.ingredients li:last-child {
  border-bottom: 0;
}

.optional {
  font-size: var(--text-sm);
}

.ingredients .add-one {
  flex-shrink: 0;
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-sm);
  color: var(--color-accent-text);
  border-color: var(--color-border);
}

.added {
  margin: var(--space-3) 0 0;
}

/* Grote groene nummers voor de stappen, als in een kookboek. */
.steps ol {
  margin: 0;
  padding: 0;
  list-style: none;
  counter-reset: step;
}

.steps li {
  position: relative;
  min-height: 2.5rem;
  margin-bottom: var(--space-4);
  padding-left: 3rem;
  counter-increment: step;
}

.steps li::before {
  content: counter(step);
  position: absolute;
  top: -0.2rem;
  left: 0;
  width: 2.25rem;
  font-family: var(--font-heading);
  font-size: var(--text-xl);
  font-weight: 700;
  line-height: 1.4;
  text-align: center;
  color: var(--color-accent-text);
}

.recipe-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin: calc(-1 * var(--space-2)) 0 var(--space-3);
  padding: 0;
  list-style: none;
}

/* Zoals de tags op de receptkaart. */
.tag {
  max-width: 100%;
  padding: 0 var(--space-2);
  overflow: hidden;
  font-size: var(--text-sm);
  font-weight: 600;
  line-height: 1.6;
  color: var(--color-accent-text);
  white-space: nowrap;
  text-overflow: ellipsis;
  background: var(--color-brand-soft);
  border-radius: var(--radius-full);
}

.variations {
  margin-top: var(--space-5);
}

.variations .notice p {
  margin-bottom: var(--space-2);
}

/* minmax(0, 1fr): een lange naam maakt een kolom niet breder dan de helft. */
.variation-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}

.variation-grid .wide {
  grid-column: 1 / -1;
}

.new-variation {
  margin-bottom: var(--space-3);
}

.add-variation {
  width: 100%;
  color: var(--color-accent-text);
  border-style: dashed;
}

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
