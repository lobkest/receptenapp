<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { useNow } from '@/composables/useNow'
import { formatSavedAt, OFFLINE_TITLE, pendingText } from '@/offline'
import { useServerStatusStore } from '@/stores/serverStatus'

// Zo lang duurt het opstarten van de slapende Render-server meestal; daarna zegt de teller
// "duurt langer dan normaal".
const USUAL_WAKE_S = 50

// De offline-melding: op elke pagina hetzelfde blok, als eerste element bovenaan, zodra er
// geen verbinding is (serverStatus.offline). Pagina's tonen hem alleen dan; App.vue toont hem
// zelf voor pagina's die offline niet werken (meta.onlineOnly, of meta.needsServer zonder
// kopie). Offline is alles wat niet online is, ook een server die nog wakker wordt
// (stores/serverStatus.js), dus ook in de eerste ogenblikken na het starten. Opbouw:
// 1. vet, overal gelijk: OFFLINE_TITLE ("Offline: geen verbinding met de server")
// 2. grijs, per pagina, de eerste die past:
//    - unavailable (paginanaam): "In huis is offline niet beschikbaar"
//    - editing: "opslaan kan weer zodra er verbinding is" (bewerkpagina's)
//    - anders de kopie: "kopie van vandaag 21:57" (savedAt in ms; formatSavedAt)
// 3. klein, de teller (serverStatus.offlineSince), elke seconde bijgewerkt:
//    - "wachten op verbinding… 12 s (opstarten duurt meestal ~50 s)"
//    - na USUAL_WAKE_S: "wachten op verbinding… 63 s (duurt langer dan normaal)"
//    - de browser meldt geen netwerk: "geen internet op dit toestel · 12 s"
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

// De teller: een eigen klok van een seconde (useNow tikt maar elke minuut), alleen zolang
// er iets te tellen is, en opgeruimd als de melding verdwijnt.
const server = useServerStatusStore()
const clock = ref(Date.now())
let ticker = null

function stopTicker() {
  clearInterval(ticker)
  ticker = null
}

watch(
  () => server.offlineSince,
  (since) => {
    stopTicker()
    clock.value = Date.now()
    if (since != null) ticker = setInterval(() => (clock.value = Date.now()), 1_000)
  },
  { immediate: true },
)
onUnmounted(stopTicker)

// { text, hint }: de uitleg tussen haakjes (hint) breekt als geheel af naar een volgende
// regel, niet midden in "(… ~50 s)".
const counter = computed(() => {
  if (server.offlineSince == null) return null
  // Max met now: na terugkeren naar de app (timers lagen stil) meteen de goede tijd.
  const seconds = Math.max(
    0,
    Math.floor((Math.max(clock.value, now.value) - server.offlineSince) / 1_000),
  )
  if (server.browserOffline) return { text: `geen internet op dit toestel · ${seconds} s` }
  const hint =
    seconds > USUAL_WAKE_S
      ? 'duurt langer dan normaal'
      : `opstarten duurt meestal ~${USUAL_WAKE_S} s`
  return { text: `wachten op verbinding… ${seconds} s`, hint: `(${hint})` }
})

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
    <small v-if="counter" class="offline-counter"
      >{{ counter.hint ? `${counter.text} ` : counter.text
      }}<span v-if="counter.hint" class="offline-counter-hint">{{ counter.hint }}</span></small
    >
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

.offline-counter-hint {
  white-space: nowrap;
}

.offline-counter {
  font-variant-numeric: tabular-nums;
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
