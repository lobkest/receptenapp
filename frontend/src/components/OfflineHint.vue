<script setup>
import { OFFLINE_TEXT } from '@/offline'

// Korte melding bij knoppen die zonder verbinding uit staan (bewerken, in huis, …).
// Wat via de outbox kan (de boodschappenlijst en de standaardlijst) blijft gewoon aan.
</script>

<template>
  <p class="offline-hint">{{ OFFLINE_TEXT }}</p>
</template>

<style scoped>
.offline-hint {
  margin: var(--space-1) 0 0;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
</style>
