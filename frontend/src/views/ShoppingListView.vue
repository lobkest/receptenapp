<script setup>
import { RouterLink } from 'vue-router'
import { useShoppingListStore } from '@/stores/shoppingList'
import { formatQuantity } from '@/utils/quantity'

// Alles staat in de store (en dus in localStorage); deze pagina toont en
// wijzigt alleen.
const list = useShoppingListStore()

function itemLine(item) {
  if (item.quantity == null) return `${item.name} — naar smaak`
  return `${formatQuantity(item.quantity)} ${item.unit} ${item.name}`
}

function sourcesLine(item) {
  return `uit: ${item.sources.map((s) => s.title).join(', ')}`
}

function clearAll() {
  if (window.confirm('De hele boodschappenlijst wissen?')) list.clearAll()
}
</script>

<template>
  <h1>Boodschappen</h1>

  <p v-if="list.items.length === 0" class="empty">
    Je boodschappenlijst is leeg. Voeg ingrediënten toe vanaf een
    <RouterLink to="/">recept</RouterLink>.
  </p>

  <template v-else>
    <ul class="items">
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
      <button type="button" class="clear-all" @click="clearAll">Alles wissen</button>
    </div>

    <p class="hint">Deze lijst staat alleen in deze browser op dit apparaat.</p>
  </template>
</template>

<style scoped>
.items {
  list-style: none;
  padding: 0;
}

.items li {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  padding: 0.4rem 0;
  border-bottom: 1px solid #eee;
}

.items label {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.sources {
  grid-column: 1;
  padding-left: 1.6rem;
  font-size: 0.85rem;
  color: #666;
}

.remove {
  grid-row: 1 / span 2;
  grid-column: 2;
  font: inherit;
}

.checked .line {
  text-decoration: line-through;
  color: #888;
}

.actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
}

.actions button {
  font: inherit;
}

.clear-all {
  color: #c00;
}

.empty,
.hint {
  color: #666;
}
</style>
