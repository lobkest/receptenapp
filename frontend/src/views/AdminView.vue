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

  <form v-if="!admin.isLoggedIn" class="login card" @submit.prevent="login">
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
    <p v-if="loginError" id="login-error" class="error login-error" role="alert">
      {{ loginError }}
    </p>
    <button type="submit" class="btn-primary btn-block" :disabled="loggingIn || !codeInput">
      {{ loggingIn ? 'Controleren…' : 'Inloggen' }}
    </button>
  </form>

  <template v-else>
    <p class="toolbar">
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

    <p v-if="message" class="message notice notice-success" role="status">{{ message }}</p>
    <p v-if="error" class="error notice notice-error" role="alert">{{ error }}</p>

    <p v-if="loading && recipes.length === 0" class="muted">Recepten laden…</p>

    <p v-else-if="!error && recipes.length === 0" class="muted">
      {{
        status === 'pending'
          ? 'Geen recepten om te beoordelen.'
          : 'Geen recepten in deze categorie.'
      }}
    </p>

    <ul v-else class="recipes">
      <li v-for="recipe in recipes" :key="recipe.id" class="card">
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
            class="btn-primary"
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
          <RouterLink :to="`/beheer/recepten/${recipe.id}/bewerken`" class="btn">
            Bewerken
          </RouterLink>
          <button
            type="button"
            class="btn-danger"
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
.login {
  max-width: 24rem;
}

.login-error {
  margin-bottom: var(--space-4);
}

.toolbar {
  display: flex;
  justify-content: flex-end;
}

/* Tabs als segmentknoppen: één rij, de gekozen tab gevuld groen. */
.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin-bottom: var(--space-4);
  padding: var(--space-1);
  background: var(--color-surface-hover);
  border-radius: var(--radius);
}

.tabs button {
  flex: 1 1 auto;
  font-size: var(--text-sm);
  background: transparent;
  border-color: transparent;
}

.tabs button[aria-pressed='true'] {
  color: var(--color-on-brand);
  background: var(--color-brand);
}

.recipes {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

h2 {
  margin: 0;
  font-size: var(--text-lg);
}

.meta {
  margin: var(--space-1) 0 var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.description {
  margin-bottom: var(--space-3);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
}
</style>
