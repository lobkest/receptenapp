<script setup>
import { computed } from 'vue'
import { formatSavedAt } from '@/offline'

// Melding bovenaan een pagina die een lokaal bewaarde kopie toont, tot er verse data is.
// savedAt: wanneer die kopie van de server kwam (ms), of null als dat onbekend is.
// offline: de browser heeft geen netwerk (dan alleen de titel); anders halen we nog op
// (", bijwerken…").
// pending: aantal wijzigingen dat nog naar de server moet.
// noCopy: de pagina heeft geen offline data (Recept toevoegen, Ingrediënten, Beheer): dan
// alleen "Offline: geen verbinding met de server", zonder kopie, tijd of "bijwerken…".
// unavailable: naam van de pagina die offline niet werkt; geeft de regel
// "In huis is offline niet beschikbaar".
// Dit is de enige offline-melding: elke pagina (en App.vue voor pagina's die op de server
// wachten) gebruikt dit component, zodat hij overal hetzelfde is.
const props = defineProps({
  savedAt: { type: Number, default: null },
  offline: { type: Boolean, default: false },
  pending: { type: Number, default: 0 },
  noCopy: { type: Boolean, default: false },
  unavailable: { type: String, default: null },
})

const title = computed(() => {
  if (props.noCopy) return 'Offline: geen verbinding met de server'
  return props.savedAt == null
    ? 'Offline kopie'
    : `Offline kopie van ${formatSavedAt(props.savedAt)}`
})

const pendingText = computed(() =>
  props.pending === 1
    ? '1 wijziging wacht op verbinding'
    : `${props.pending} wijzigingen wachten op verbinding`,
)
</script>

<template>
  <div class="offline-notice" role="status">
    <!-- Zonder netwerk alleen de titel: "Offline kopie van vandaag 18:00" zegt het al.
         Met netwerk maar nog niet ververst: ", bijwerken…". -->
    <strong v-if="noCopy">{{ title }}</strong>
    <strong v-else-if="offline">{{ title }}</strong>
    <span v-else
      ><strong>{{ title }}</strong
      >, <span class="sync-state">bijwerken…</span></span
    >
    <span v-if="pending > 0" class="pending">{{ pendingText }}</span>
    <span v-if="unavailable" class="offline-unavailable"
      >{{ unavailable }} is offline niet beschikbaar</span
    >
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

.pending {
  font-weight: 600;
}

.offline-detail,
.offline-unavailable {
  color: var(--color-text-muted);
}
</style>
