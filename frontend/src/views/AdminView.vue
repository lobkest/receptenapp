<script setup>
import { nextTick, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useAdminStore } from '@/stores/admin'

const admin = useAdminStore()

const TABS = [
  { status: 'pending', label: 'Wachtend' },
  { status: 'approved', label: 'Goedgekeurd' },
  { status: 'rejected', label: 'Afgewezen' },
  { status: '', label: 'Alles' },
]

const STATUS_LABELS = { pending: 'Wachtend', approved: 'Goedgekeurd', rejected: 'Afgewezen' }

// --- Inloggen ---
const codeInput = ref('')
const codeField = ref(null)
const loggingIn = ref(false)
const loginError = ref(null)

async function login() {
  loggingIn.value = true
  loginError.value = null
  try {
    await admin.login(codeInput.value)
    codeInput.value = ''
  } catch (e) {
    loginError.value = e.kind === 'unauthorized' ? 'Deze code is onjuist.' : e.message
  } finally {
    loggingIn.value = false
  }
}

// Zelf uitloggen geeft geen melding; automatisch uitloggen na een 401 wel.
let loggedOutByUser = false

function logout() {
  loggedOutByUser = true
  admin.logout()
}

async function focusCodeField() {
  await nextTick()
  codeField.value?.focus()
}

// --- Overzicht ---
const status = ref('pending')
const recipes = ref([])
const loading = ref(false)
const error = ref(null)
// id van het recept waarvoor een request loopt; die knoppen zijn dan uitgeschakeld.
const busyId = ref(null)
// Een flash van een andere pagina: een bevestiging als je ingelogd bent,
// anders de reden waarom je uitgelogd bent.
const flash = admin.takeFlash()
const message = ref(admin.isLoggedIn ? flash : null)
if (!admin.isLoggedIn) loginError.value = flash

async function load() {
  loading.value = true
  error.value = null
  try {
    recipes.value = await admin.fetchRecipes(status.value)
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

function selectTab(tabStatus) {
  status.value = tabStatus
  message.value = null
  load()
}

// Voert een actie uit op één recept, toont een bevestiging en laadt de lijst opnieuw.
async function act(recipe, action, successMessage) {
  busyId.value = recipe.id
  message.value = null
  error.value = null
  try {
    await action(recipe.id)
    message.value = successMessage
    await load()
  } catch (e) {
    error.value = e.message
  } finally {
    busyId.value = null
  }
}

function approve(recipe) {
  act(recipe, admin.approve, `"${recipe.title}" is goedgekeurd.`)
}

function reject(recipe) {
  act(recipe, admin.reject, `"${recipe.title}" is afgewezen.`)
}

function destroy(recipe) {
  const sure = window.confirm(
    `"${recipe.title}" definitief verwijderen? Dit kan niet ongedaan worden gemaakt.`,
  )
  if (sure) act(recipe, admin.destroy, `"${recipe.title}" is verwijderd.`)
}

function shorten(text, max = 120) {
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

// Na inloggen de lijst laden; na (automatisch) uitloggen terug naar het invulveld.
watch(
  () => admin.isLoggedIn,
  (loggedIn) => {
    if (loggedIn) {
      load()
    } else {
      recipes.value = []
      message.value = null
      error.value = null
      loginError.value = loggedOutByUser ? null : 'Je code is niet (meer) geldig. Log opnieuw in.'
      loggedOutByUser = false
      focusCodeField()
    }
  },
)

onMounted(() => {
  if (admin.isLoggedIn) {
    load()
  } else {
    focusCodeField()
  }
})
</script>

<template>
  <h1>Beheer</h1>

  <form v-if="!admin.isLoggedIn" class="login" @submit.prevent="login">
    <div class="field">
      <label for="admin-code">Beheercode</label>
      <input
        id="admin-code"
        ref="codeField"
        v-model="codeInput"
        type="password"
        autocomplete="current-password"
        required
        :aria-invalid="!!loginError"
        aria-describedby="login-error"
      />
    </div>
    <p v-if="loginError" id="login-error" class="error" role="alert">{{ loginError }}</p>
    <button type="submit" :disabled="loggingIn || !codeInput">
      {{ loggingIn ? 'Controleren…' : 'Inloggen' }}
    </button>
  </form>

  <template v-else>
    <p>
      <button type="button" @click="logout">Uitloggen</button>
    </p>

    <div class="tabs" role="group" aria-label="Filter op status">
      <button
        v-for="tab in TABS"
        :key="tab.label"
        type="button"
        :aria-pressed="status === tab.status"
        @click="selectTab(tab.status)"
      >
        {{ tab.label }}
      </button>
    </div>

    <p v-if="message" class="message" role="status">{{ message }}</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <p v-if="loading && recipes.length === 0">Recepten laden…</p>

    <p v-else-if="!error && recipes.length === 0">
      {{
        status === 'pending'
          ? 'Geen recepten om te beoordelen.'
          : 'Geen recepten in deze categorie.'
      }}
    </p>

    <ul v-else class="recipes">
      <li v-for="recipe in recipes" :key="recipe.id">
        <h2>{{ recipe.title }}</h2>
        <p class="meta">
          {{ recipe.servings }} {{ recipe.servings === 1 ? 'portie' : 'porties' }} ·
          {{ STATUS_LABELS[recipe.status] ?? recipe.status }} · ingestuurd op
          <time :datetime="recipe.created_at">{{ formatDate(recipe.created_at) }}</time>
        </p>
        <p v-if="recipe.description" class="description">{{ shorten(recipe.description) }}</p>

        <div class="actions">
          <button
            v-if="recipe.status !== 'approved'"
            type="button"
            :disabled="busyId === recipe.id"
            @click="approve(recipe)"
          >
            Goedkeuren
          </button>
          <button
            v-if="recipe.status !== 'rejected'"
            type="button"
            :disabled="busyId === recipe.id"
            @click="reject(recipe)"
          >
            Afwijzen
          </button>
          <RouterLink :to="`/beheer/recepten/${recipe.id}/bewerken`">Bewerken</RouterLink>
          <button
            type="button"
            class="danger"
            :disabled="busyId === recipe.id"
            @click="destroy(recipe)"
          >
            Verwijderen
          </button>
        </div>
      </li>
    </ul>
  </template>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-bottom: 1rem;
}

input {
  font: inherit;
  padding: 0.5rem;
  border: 1px solid #bbb;
  border-radius: 4px;
}

button {
  font: inherit;
  padding: 0.4rem 0.8rem;
}

.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.tabs button[aria-pressed='true'] {
  font-weight: bold;
  border-bottom: 3px solid #222;
}

.message {
  padding: 0.75rem;
  background: #e8f5e9;
  color: #1b5e20;
  border-radius: 4px;
}

.error {
  color: #c00;
}

.recipes {
  list-style: none;
  padding: 0;
}

.recipes li {
  padding: 0.75rem 0;
  border-bottom: 1px solid #eee;
}

h2 {
  font-size: 1.1rem;
  margin: 0;
}

.meta {
  color: #666;
  margin: 0.25rem 0;
}

.description {
  margin: 0.25rem 0;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.danger {
  color: #c00;
}
</style>
