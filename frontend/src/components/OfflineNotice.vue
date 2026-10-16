<script setup>
import { computed } from 'vue'
import { formatSavedAt } from '@/offline'

// Melding bovenaan een pagina die offline een opgeslagen kopie toont.
// savedAt: wanneer die kopie van de server kwam (ms), of null als er geen is.
const props = defineProps({ savedAt: { type: Number, default: null } })

const title = computed(() =>
  props.savedAt == null ? 'Offline' : `Offline – opgeslagen om ${formatSavedAt(props.savedAt)}`,
)
</script>

<template>
  <div class="offline-notice" role="status">
    <strong>{{ title }}</strong>
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

.offline-detail {
  color: var(--color-text-muted);
}
</style>
