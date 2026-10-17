<script setup>
import { computed } from 'vue'
import { formatSavedAt } from '@/offline'

// Melding bovenaan een pagina die een lokaal bewaarde kopie toont, tot er verse data is.
// savedAt: wanneer die kopie van de server kwam (ms), of null als dat onbekend is.
// offline: de browser heeft geen netwerk ("Offline"); anders halen we nog op ("bijwerken…").
// pending: aantal wijzigingen dat nog naar de server moet.
const props = defineProps({
  savedAt: { type: Number, default: null },
  offline: { type: Boolean, default: false },
  pending: { type: Number, default: 0 },
})

const title = computed(() =>
  props.savedAt == null ? 'Offline kopie' : `Offline kopie van ${formatSavedAt(props.savedAt)}`,
)

const pendingText = computed(() =>
  props.pending === 1
    ? '1 wijziging nog niet gesynchroniseerd'
    : `${props.pending} wijzigingen nog niet gesynchroniseerd`,
)
</script>

<template>
  <div class="offline-notice" role="status">
    <span
      ><strong>{{ title }}</strong
      >,
      <span v-if="offline" class="sync-state is-offline">Offline</span>
      <span v-else class="sync-state">bijwerken…</span></span
    >
    <span v-if="pending > 0" class="pending">{{ pendingText }}</span>
    <span v-if="$slots.default" class="offline-detail"><slot /></span>
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

.is-offline {
  font-weight: 600;
}

.pending {
  font-weight: 600;
}

.offline-detail {
  color: var(--color-text-muted);
}
</style>
