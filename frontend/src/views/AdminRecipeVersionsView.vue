<script setup>
import { ref, useTemplateRef, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useAdminStore } from '@/stores/admin'

// Alle bewaarde versies van één recept (maximaal 50), nieuwste eerst. De bovenste is
// hoe het recept nu is; elke andere kun je terugzetten. Terugzetten is zelf ook een
// wijziging, dus daarna staat er een nieuwe versie bovenaan.
const props = defineProps({
  id: { type: String, required: true },
})

const admin = useAdminStore()
const router = useRouter()
const confirmDialog = useTemplateRef('confirmDialog')

const recipe = ref(null)
const versions = ref([])
const loading = ref(false)
const notFound = ref(false)
const error = ref(null)
const message = ref(null)
const busy = ref(false)

async function load() {
  loading.value = true
  notFound.value = false
  error.value = null
  try {
    const data = await admin.fetchVersions(props.id)
    recipe.value = data.recipe
    versions.value = data.versions
  } catch (e) {
    if (e.kind === 'not_found') {
      notFound.value = true
    } else if (e.kind !== 'unauthorized') {
      error.value = e.message
    }
  } finally {
    loading.value = false
  }
}

function formatDate(iso) {
  return new Date(iso).toLocaleString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function restore(version) {
  const sure = await confirmDialog.value.ask({
    title: 'Deze versie terugzetten?',
    text: `Het recept wordt weer zoals op ${formatDate(version.created_at)}: titel, ingrediënten, stappen en tags. De huidige versie blijft bewaard.`,
    confirmLabel: 'Terugzetten',
  })
  if (!sure) return

  busy.value = true
  message.value = null
  error.value = null
  try {
    await admin.restoreVersion(props.id, version.id)
    message.value = `De versie van ${formatDate(version.created_at)} is teruggezet.`
    await load()
  } catch (e) {
    if (e.kind !== 'unauthorized') error.value = e.message
  } finally {
    busy.value = false
  }
}

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
  <h1>Versies</h1>

  <p v-if="loading && !recipe" class="muted">Versies laden…</p>

  <p v-else-if="notFound">Dit recept bestaat niet (meer).</p>

  <template v-else-if="recipe">
    <p class="recipe-title">
      <RouterLink
        v-if="!recipe.deletion_requested_at"
        :to="{ name: 'recipe', params: { id: recipe.id } }"
      >
        {{ recipe.title }}
      </RouterLink>
      <template v-else>{{ recipe.title }} <span class="muted">(verborgen)</span></template>
    </p>

    <p v-if="message" class="notice notice-success" role="status">{{ message }}</p>
    <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>

    <p v-if="versions.length === 0" class="empty card">
      Nog geen versies: dit recept is niet meer gewijzigd sinds de versiegeschiedenis bestaat.
    </p>

    <ol v-else class="versions">
      <li v-for="version in versions" :key="version.id" class="card" :data-id="version.id">
        <p class="date">
          <time :datetime="version.created_at">{{ formatDate(version.created_at) }}</time>
          <span v-if="version.current" class="current">Huidige versie</span>
        </p>
        <p class="summary">{{ version.summary }}</p>
        <button
          v-if="!version.current"
          type="button"
          class="restore"
          :disabled="busy"
          @click="restore(version)"
        >
          Deze versie terugzetten
        </button>
      </li>
    </ol>
  </template>

  <p v-else-if="error" class="notice notice-error" role="alert">{{ error }}</p>

  <p><RouterLink to="/beheer" class="back-link">← Terug naar beheer</RouterLink></p>

  <ConfirmDialog ref="confirmDialog" />
</template>

<style scoped>
.recipe-title {
  font-size: var(--text-lg);
  font-weight: 600;
  overflow-wrap: anywhere;
}

.empty {
  text-align: center;
}

.versions {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.date {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
  margin-bottom: var(--space-1);
  font-weight: 600;
}

.current {
  padding: 0 var(--space-2);
  font-size: var(--text-xs);
  line-height: 1.6;
  color: var(--color-accent-text);
  background: var(--color-brand-soft);
  border-radius: var(--radius-full);
}

.summary {
  margin-bottom: var(--space-3);
  color: var(--color-text-muted);
}

.summary:last-child {
  margin-bottom: 0;
}
</style>
