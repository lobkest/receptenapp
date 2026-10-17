<script setup>
import { computed } from 'vue'
import { useServerStatusStore } from '@/stores/serverStatus'

// Laadmelding zolang de server niet online is (zie src/stores/serverStatus.js), in plaats
// van de pagina met mogelijk oude data. Verschijnt pas na een halve seconde, zodat je hem
// bij een wakkere server niet even ziet flitsen.
const server = useServerStatusStore()

const text = computed(() => {
  if (server.status === 'waking') return 'Server wordt wakker, ophalen… (kan ~1 minuut duren)'
  if (server.browserOffline) return 'Offline. Zodra er weer verbinding is, wordt alles opgehaald.'
  return 'Server niet bereikbaar, opnieuw proberen…'
})
</script>

<template>
  <div class="server-waiting card" role="status">
    <span v-if="!server.browserOffline" class="spinner" aria-hidden="true"></span>
    <p>{{ text }}</p>
  </div>
</template>

<style scoped>
.server-waiting {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-top: var(--space-3);
  animation: appear 0.2s ease-out 0.5s both;
}

.server-waiting p {
  margin: 0;
}

.spinner {
  flex-shrink: 0;
  width: 1.25rem;
  height: 1.25rem;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-brand);
  border-radius: var(--radius-full);
  animation: spin 0.9s linear infinite;
}

@keyframes appear {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation-duration: 3s;
  }
}
</style>
