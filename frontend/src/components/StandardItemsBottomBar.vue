<script setup>
import { RouterLink } from 'vue-router'

// Onderaan de standaardlijst, en blijft in beeld (boven de menubalk), ook als de lijst
// lang is: een korte bevestiging en/of in de selectiemodus de knoppen voor de selectie.
defineProps({
  // { text, toList } of null; toList: met een link "Bekijk lijst".
  message: { type: Object, default: null },
  selecting: { type: Boolean, default: false },
  selectedCount: { type: Number, default: 0 },
})

const emit = defineEmits(['add-selected', 'remove-selected', 'stop-selecting'])
</script>

<template>
  <div class="bottom-bar card">
    <p v-if="message" class="added notice notice-success" role="status">
      {{ message.text }}
      <RouterLink v-if="message.toList" to="/boodschappen">Bekijk lijst</RouterLink>
    </p>
    <div v-if="selecting" class="selection-actions">
      <button
        type="button"
        class="add-selected btn-primary"
        :disabled="selectedCount === 0"
        @click="emit('add-selected')"
      >
        Op lijst ({{ selectedCount }})
      </button>
      <button
        type="button"
        class="remove-selected btn-danger"
        :disabled="selectedCount === 0"
        @click="emit('remove-selected')"
      >
        Verwijderen ({{ selectedCount }})
      </button>
      <button type="button" class="stop-selecting" @click="emit('stop-selecting')">
        Annuleren
      </button>
    </div>
  </div>
</template>

<style scoped>
.bottom-bar {
  position: sticky;
  bottom: calc(var(--nav-height) + env(safe-area-inset-bottom) + var(--space-2));
  z-index: 5;
  margin-top: var(--space-4);
  padding: var(--space-3);
  box-shadow: var(--shadow);
}

@media (min-width: 40rem) {
  .bottom-bar {
    bottom: var(--space-3);
  }
}

.added {
  margin-bottom: 0;
}

.added + .selection-actions {
  margin-top: var(--space-3);
}

.added a {
  color: inherit;
  font-weight: 600;
}

.selection-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.selection-actions button {
  flex: 1 1 auto;
  font-size: var(--text-sm);
}
</style>
