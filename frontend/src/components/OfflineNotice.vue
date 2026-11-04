<script setup>
import { computed } from 'vue'
import { useNow } from '@/composables/useNow'
import { formatSavedAt, OFFLINE_TITLE, pendingText } from '@/offline'
import { APP_VERSION } from '@/version'

// De offline-melding: op elke pagina hetzelfde blok, als eerste element bovenaan, zodra er
// geen verbinding is (serverStatus.offline). Pagina's tonen hem alleen dan; App.vue toont hem
// zelf voor pagina's die offline niet werken (meta.onlineOnly, of meta.needsServer zonder
// kopie). Opbouw, altijd twee regels:
// 1. vet, overal gelijk: OFFLINE_TITLE ("Offline: geen verbinding met de server")
// 2. grijs, per pagina, de eerste die past:
//    - unavailable (paginanaam): "In huis is offline niet beschikbaar"
//    - editing: "opslaan kan weer zodra er verbinding is" (bewerkpagina's)
//    - anders de kopie: "kopie van vandaag 21:57" (savedAt in ms; formatSavedAt)
// Klein eronder in het blok: welke build er draait (offline kan dat een oudere zijn dan op
// de server, tot je weer online bent; zie src/version.js en de service worker).
// Wat een pagina verder wil zeggen (afvinken kan gewoon, wijzigingen wachten), staat
// eronder, buiten het blok: pending (aantal wijzigingen in de outbox) en de slot.
const props = defineProps({
  savedAt: { type: Number, default: null },
  unavailable: { type: String, default: null },
  editing: { type: Boolean, default: false },
  pending: { type: Number, default: 0 },
})

// Opnieuw berekend als de tijd verstrijkt en bij terugkeren naar de app (useNow), zodat
// "vandaag" na middernacht "gisteren" wordt, ook als de app al die tijd open stond.
const now = useNow()

// Een commit-hash kort (7 tekens), zoals git hem toont; een andere versienaam zoals hij is.
const build = /^[0-9a-f]{40}$/.test(APP_VERSION) ? APP_VERSION.slice(0, 7) : APP_VERSION

const detail = computed(() => {
  if (props.unavailable) return `${props.unavailable} is offline niet beschikbaar`
  if (props.editing) return 'opslaan kan weer zodra er verbinding is'
  if (props.savedAt == null) return 'offline kopie'
  return `kopie van ${formatSavedAt(props.savedAt, now.value)}`
})
</script>

<template>
  <div class="offline-notice" role="status">
    <strong class="offline-title">{{ OFFLINE_TITLE }}</strong>
    <span class="offline-detail">{{ detail }}</span>
    <small class="offline-build">versie {{ build }}</small>
  </div>
  <div v-if="pending > 0 || $slots.default" class="offline-extra">
    <p v-if="pending > 0" class="pending">{{ pendingText(pending) }}</p>
    <p v-if="$slots.default" class="offline-extra-text"><slot /></p>
  </div>
</template>

<style scoped>
.offline-notice {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin-bottom: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-hover);
  font-size: var(--text-sm);
}

.offline-title {
  font-weight: 700;
}

.offline-detail {
  color: var(--color-text-muted);
}

.offline-build {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.offline-extra {
  margin: calc(-1 * var(--space-1)) 0 var(--space-3);
  font-size: var(--text-sm);
}

.offline-extra p {
  margin: 0 0 var(--space-1);
}

.pending {
  font-weight: 600;
}

.offline-extra-text {
  color: var(--color-text-muted);
}
</style>
