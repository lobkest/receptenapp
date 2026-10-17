<script setup>
import { nextTick, onMounted, ref, useTemplateRef, watch } from 'vue'
import { RouterLink } from 'vue-router'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useAdminStore } from '@/stores/admin'
import { formatDate } from '@/utils/format'

// Beheer is er nog voor twee dingen: verwijderverzoeken afhandelen (van recepten en van
// variaties) en versies terugzetten (via de receptpagina of de link hieronder). Toevoegen
// en bewerken kan iedereen.
const admin = useAdminStore()
const confirmDialog = useTemplateRef('confirmDialog')

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

// --- Verwijderverzoeken ---
const requests = ref([])
const loading = ref(false)
const error = ref(null)
// Sleutel van het verzoek waarvoor een request loopt; die knoppen zijn dan uitgeschakeld.
// Een recept en een variatie kunnen hetzelfde id hebben, dus de soort hoort erbij.
const busyKey = ref(null)

function keyOf(request) {
  return `${request.type}-${request.id}`
}

function isVariation(request) {
  return request.type === 'variation'
}

// "Pannenkoeken" of "Met spek" (variatie op Pannenkoeken).
function nameOf(request) {
  return isVariation(request)
    ? `"${request.title}" (variatie op ${request.recipe_title})`
    : `"${request.title}"`
}
// Een flash van een andere pagina: een bevestiging als je ingelogd bent,
// anders de reden waarom je uitgelogd bent.
const flash = admin.takeFlash()
const message = ref(admin.isLoggedIn ? flash : null)
if (!admin.isLoggedIn) loginError.value = flash

async function load() {
  loading.value = true
  error.value = null
  try {
    requests.value = await admin.fetchDeletionRequests()
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

// Voert een actie uit op één verzoek, toont een bevestiging en laadt de lijst opnieuw.
async function act(request, action, successMessage) {
  busyKey.value = keyOf(request)
  message.value = null
  error.value = null
  try {
    await action(request.id)
    message.value = successMessage
    await load()
  } catch (e) {
    error.value = e.message
  } finally {
    busyKey.value = null
  }
}

function restore(request) {
  const action = isVariation(request) ? admin.restoreVariation : admin.restore
  act(request, action, `${nameOf(request)} is teruggezet en weer zichtbaar.`)
}

async function destroy(request) {
  const sure = await confirmDialog.value.ask({
    title: `${nameOf(request)} definitief verwijderen?`,
    text: isVariation(request)
      ? 'De variatie verdwijnt. Ze staat nog wel in de versies van het recept. Dit kan niet ongedaan worden gemaakt.'
      : 'Het recept en al zijn versies verdwijnen. Dit kan niet ongedaan worden gemaakt.',
    confirmLabel: 'Definitief verwijderen',
  })
  if (!sure) return
  const action = isVariation(request) ? admin.destroyVariation : admin.destroy
  act(request, action, `${nameOf(request)} is definitief verwijderd.`)
}

// Na inloggen de lijst laden; na (automatisch) uitloggen terug naar het invulveld.
watch(
  () => admin.isLoggedIn,
  (loggedIn) => {
    if (loggedIn) {
      load()
    } else {
      requests.value = []
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

    <h2>Verwijderverzoeken</h2>
    <p class="muted intro">
      Deze recepten en variaties zijn verborgen omdat iemand ze wil verwijderen. Verwijder ze
      definitief, of zet ze terug.
    </p>

    <p v-if="message" class="message notice notice-success" role="status">{{ message }}</p>
    <p v-if="error" class="error notice notice-error" role="alert">{{ error }}</p>

    <p v-if="loading && requests.length === 0" class="muted">Verzoeken laden…</p>

    <p v-else-if="!error && requests.length === 0" class="empty card">Geen verwijderverzoeken.</p>

    <ul v-else class="requests">
      <li
        v-for="request in requests"
        :key="keyOf(request)"
        class="card"
        :class="request.type"
        :data-id="request.id"
      >
        <p v-if="isVariation(request)" class="kind">
          Variatie op
          <RouterLink :to="{ name: 'recipe', params: { id: request.recipe_id } }">
            {{ request.recipe_title }}
          </RouterLink>
        </p>
        <h3>{{ request.title }}</h3>
        <p class="meta">
          Aangevraagd op
          <time :datetime="request.deletion_requested_at">
            {{ formatDate(request.deletion_requested_at) }}
          </time>
        </p>
        <p class="reason">
          <template v-if="request.deletion_reason">Reden: {{ request.deletion_reason }}</template>
          <span v-else class="muted">Geen reden opgegeven.</span>
        </p>

        <div class="actions">
          <button
            type="button"
            class="restore btn-primary"
            :disabled="busyKey === keyOf(request)"
            @click="restore(request)"
          >
            Terugzetten
          </button>
          <RouterLink
            v-if="!isVariation(request)"
            :to="{ name: 'admin-recipe-versions', params: { id: request.id } }"
            class="btn versions"
          >
            Versies
          </RouterLink>
          <button
            type="button"
            class="destroy btn-danger"
            :disabled="busyKey === keyOf(request)"
            @click="destroy(request)"
          >
            Definitief verwijderen
          </button>
        </div>
      </li>
    </ul>
  </template>

  <ConfirmDialog ref="confirmDialog" />
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

.intro {
  font-size: var(--text-sm);
}

.empty {
  text-align: center;
}

.requests {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

/* Het label "Variatie op …" boven de naam, klein en in hoofdletters zoals een rubriek. */
.kind {
  margin: 0 0 var(--space-1);
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  overflow-wrap: anywhere;
}

.kind a {
  color: inherit;
}

h3 {
  margin: 0;
  font-size: var(--text-lg);
  overflow-wrap: anywhere;
}

.meta {
  margin: var(--space-1) 0 var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.reason {
  margin-bottom: var(--space-3);
  overflow-wrap: anywhere;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
}
</style>
