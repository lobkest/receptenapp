<script setup>
import { useTemplateRef } from 'vue'
import { RouterLink } from 'vue-router'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useShoppingListStore } from '@/stores/shoppingList'
import { formatQuantity } from '@/utils/quantity'

// Alles staat in de store (en dus in localStorage); deze pagina toont en
// wijzigt alleen.
const list = useShoppingListStore()

// Zonder hoeveelheid ("naar smaak" uit een recept, of wc-papier uit de
// standaardlijst) is alleen de naam genoeg: je moet het gewoon kopen.
function itemLine(item) {
  if (item.quantity == null) return item.name
  return `${formatQuantity(item.quantity)} ${item.unit} ${item.name}`
}

function sourcesLine(item) {
  return `uit: ${item.sources.map((s) => s.title).join(', ')}`
}

const confirmDialog = useTemplateRef('confirmDialog')

async function clearAll() {
  const sure = await confirmDialog.value.ask({
    title: 'De hele boodschappenlijst wissen?',
    text: 'Alle regels verdwijnen, ook de afgevinkte.',
  })
  if (sure) list.clearAll()
}
</script>

<template>
  <h1>Boodschappen</h1>

  <p v-if="list.items.length === 0" class="empty card">
    Je boodschappenlijst is leeg. Voeg ingrediënten toe vanaf een
    <RouterLink to="/">recept</RouterLink>.
  </p>

  <template v-else>
    <ul class="items card">
      <li v-for="item in list.items" :key="item.key" :class="{ checked: item.checked }">
        <label>
          <input type="checkbox" :checked="item.checked" @change="list.toggle(item.key)" />
          <span class="line">{{ itemLine(item) }}</span>
        </label>
        <span class="sources">{{ sourcesLine(item) }}</span>
        <button
          type="button"
          class="remove"
          :aria-label="`${item.name} verwijderen`"
          @click="list.remove(item.key)"
        >
          ✕
        </button>
      </li>
    </ul>

    <div class="actions">
      <button
        type="button"
        class="clear-checked"
        :disabled="!list.hasChecked"
        @click="list.clearChecked()"
      >
        Afgevinkte wissen
      </button>
      <button type="button" class="clear-all btn-danger" @click="clearAll">Alles wissen</button>
    </div>

    <p class="hint muted">Deze lijst staat alleen in deze browser op dit apparaat.</p>
  </template>

  <ConfirmDialog ref="confirmDialog" />
</template>

<style scoped>
.items {
  margin: 0;
  padding: 0 var(--space-4);
  list-style: none;
}

.items li {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  column-gap: var(--space-2);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--color-border);
}

.items li:last-child {
  border-bottom: 0;
}

/* Het hele label is het aanraakvak, niet alleen het vinkje. */
.items label {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  min-height: var(--tap);
  font-weight: 400;
  font-size: var(--text-lg);
  cursor: pointer;
}

.items input[type='checkbox'] {
  flex-shrink: 0;
}

.sources {
  grid-column: 1;
  /* Zelfde inspringing als de tekst naast het vinkje. */
  padding-left: calc(1.5rem + var(--space-3));
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.remove {
  grid-row: 1 / span 2;
  grid-column: 2;
  color: var(--color-text-muted);
  background: transparent;
  border-color: transparent;
}

.checked .line {
  text-decoration: line-through;
  color: var(--color-text-muted);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-4);
}

.actions button {
  flex: 1 1 auto;
}

@media (min-width: 40rem) {
  .actions button {
    flex: 0 0 auto;
  }
}

.hint {
  margin-top: var(--space-4);
  font-size: var(--text-sm);
}
</style>
