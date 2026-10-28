<script setup>
import HouseButton from '@/components/HouseButton.vue'

// Eén item op de standaardlijst: de naam met drie icoonknoppen (op lijst, bewerken,
// verwijderen), of in de selectiemodus een vinkje over de hele regel. Wat een knop doet,
// regelt StandardItemsView via de events.
// Staat het item al (open) op de boodschappenlijst (onList), dan is [+] "✓ op lijst"; die
// blijft klikbaar en zet er dan één bij ("melk ×2").
// Ervoor het huisje (HouseButton, compact): bij elk item, ook zonder ingrediënt (de eerste
// tik maakt dat aan); een tik zet het om. In de selectiemodus
// alleen een label "in huis" (inHouse): dat slaat "Op lijst (n)" over.
defineProps({
  item: { type: Object, required: true },
  selecting: { type: Boolean, default: false },
  onList: { type: Boolean, default: false },
  inHouse: { type: Boolean, default: false },
})

// De gekozen item-id's in de selectiemodus (v-model:selected).
const selected = defineModel('selected', { type: Array, default: () => [] })

// error: het huisje kon niet worden omgezet (melding bovenaan de pagina).
const emit = defineEmits(['add', 'edit', 'remove', 'error'])
</script>

<template>
  <label v-if="selecting" class="row select">
    <input v-model="selected" type="checkbox" :value="item.id" />
    <span class="line">{{ item.name }}</span>
    <span v-if="inHouse" class="in-house-tag">in huis</span>
    <span v-if="onList" class="on-list-tag">✓ op lijst</span>
  </label>

  <div v-else class="row">
    <span class="line">{{ item.name }}</span>
    <div class="item-actions">
      <HouseButton
        class="house"
        :ingredient="item"
        compact
        create-missing
        @error="emit('error', $event)"
      />
      <button
        v-if="onList"
        type="button"
        class="add-one on-list"
        :aria-label="`${item.name} staat op je boodschappenlijst; tik voor nog één`"
        @click="emit('add', item)"
      >
        ✓ op lijst
      </button>
      <button
        v-else
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

/* Gevuld groen, zoals "✓ op lijst" op de receptpagina: in één oogopslag anders dan [+]. */
.on-list,
.on-list:hover:not(:disabled) {
  align-self: center;
  padding: var(--space-1) var(--space-2);
  font-size: var(--text-sm);
  white-space: nowrap;
  color: var(--color-on-brand);
  background: var(--color-brand);
  border-color: var(--color-brand);
}

/* In de selectiemodus: klein, zodat je ziet dat "Op lijst" er één bij zet. */
.on-list-tag {
  flex-shrink: 0;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-success-text);
}

.remove {
  color: var(--color-danger);
}

/* Het huisje in de rij icoonknoppen: verticaal gecentreerd, met wat lucht naar [+]. */
.house {
  align-self: center;
  margin-right: var(--space-1);
}

.in-house-tag {
  flex-shrink: 0;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-house-text);
}
</style>
