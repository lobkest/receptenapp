<script setup>
// Eén item op de standaardlijst: de naam met drie icoonknoppen (op lijst, bewerken,
// verwijderen), of in de selectiemodus een vinkje over de hele regel. Wat een knop doet,
// regelt StandardItemsView via de events.
defineProps({
  item: { type: Object, required: true },
  selecting: { type: Boolean, default: false },
})

// De gekozen item-id's in de selectiemodus (v-model:selected).
const selected = defineModel('selected', { type: Array, default: () => [] })

const emit = defineEmits(['add', 'edit', 'remove'])
</script>

<template>
  <label v-if="selecting" class="row select">
    <input v-model="selected" type="checkbox" :value="item.id" />
    <span class="line">{{ item.name }}</span>
  </label>

  <div v-else class="row">
    <span class="line">{{ item.name }}</span>
    <div class="item-actions">
      <button
        type="button"
        class="icon add-one"
        :aria-label="`${item.name} op boodschappenlijst`"
        @click="emit('add', item)"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      <button
        type="button"
        class="icon edit"
        :aria-label="`${item.name} bewerken`"
        @click="emit('edit', item)"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
          <path d="m13.5 6.5 4 4" />
        </svg>
      </button>
      <button
        type="button"
        class="icon remove"
        :aria-label="`${item.name} verwijderen`"
        @click="emit('remove', item)"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Compact: naam links, knoppen rechts op dezelfde regel. */
.row {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  min-height: var(--tap);
}

.line {
  flex: 1;
  min-width: 0;
  font-size: var(--text-lg);
  overflow-wrap: anywhere;
}

/* In de selectiemodus is de hele regel het tikvlak. */
.select {
  gap: var(--space-3);
  font-weight: 400;
  cursor: pointer;
}

.select input {
  flex-shrink: 0;
}

.item-actions {
  display: flex;
  flex-shrink: 0;
}

/* Icoonknoppen: --tap×--tap (40×40), zonder rand, zodat de regel rustig blijft. */
.icon {
  width: var(--tap);
  padding: 0;
  color: var(--color-text-muted);
  background: transparent;
  border-color: transparent;
}

.icon svg {
  width: 22px;
  height: 22px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.add-one {
  color: var(--color-accent-text);
}

.remove {
  color: var(--color-danger);
}
</style>
