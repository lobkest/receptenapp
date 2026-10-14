<script setup>
import { onMounted, onUnmounted, ref, useTemplateRef } from 'vue'
import { RouterLink } from 'vue-router'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useShoppingListStore } from '@/stores/shoppingList'
import { formatQuantity } from '@/utils/quantity'

// De lijst staat op de server (via de store), gedeeld met iedereen die de link heeft.
// Bij openen van deze pagina halen we hem opnieuw op; bij terugschakelen naar de app
// doet App.vue dat (visibilitychange).
const list = useShoppingListStore()

const loading = ref(false)
// Melding bij een mislukte actie (netwerk, server, te veel verzoeken).
const error = ref(null)

async function attempt(action) {
  error.value = null
  try {
    await action()
    return true
  } catch (e) {
    error.value = e.kind === 'not_found' ? 'Deze regel bestaat niet meer.' : e.message
    return false
  }
}

onMounted(async () => {
  // Alleen de eerste keer "laden…"; daarna staat de oude lijst er al tijdens het verversen.
  loading.value = !list.loaded
  await attempt(() => list.load())
  loading.value = false
})

// Zonder hoeveelheid ("naar smaak" uit een recept, of wc-papier uit de
// standaardlijst) is alleen de naam genoeg: je moet het gewoon kopen.
function itemLine(item) {
  if (item.quantity == null) return item.name
  return `${formatQuantity(item.quantity)} ${item.unit} ${item.name}`
}

const confirmDialog = useTemplateRef('confirmDialog')

async function clearAll() {
  const sure = await confirmDialog.value.ask({
    title: 'De hele boodschappenlijst wissen?',
    text: 'Alle regels verdwijnen, ook de afgevinkte. Ook voor iedereen met wie je de lijst deelt.',
  })
  if (sure) attempt(() => list.clearAll())
}

// ---------- Import van de oude lijst uit deze browser ----------

const importing = ref(false)
const message = ref(null)
let messageTimer = null

onUnmounted(() => clearTimeout(messageTimer))

async function importLegacy() {
  importing.value = true
  let count = 0
  const ok = await attempt(async () => (count = await list.importLegacy()))
  importing.value = false
  if (!ok) return
  message.value = `${count === 1 ? '1 regel' : `${count} regels`} geïmporteerd.`
  clearTimeout(messageTimer)
  messageTimer = setTimeout(() => (message.value = null), 3000)
}
</script>

<template>
  <h1>Boodschappen</h1>

  <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>
  <p v-if="message" class="notice notice-success" role="status">{{ message }}</p>

  <div v-if="list.legacyItems.length && list.loaded" class="import card">
    <p>
      In deze browser staat nog een oude boodschappenlijst ({{
        list.legacyItems.length === 1 ? '1 regel' : `${list.legacyItems.length} regels`
      }}). Zet hem op de gedeelde lijst; de regels komen erbij.
    </p>
    <button type="button" class="import-legacy" :disabled="importing" @click="importLegacy">
      Lijst uit deze browser importeren
    </button>
  </div>

  <p v-if="loading" class="muted">Boodschappenlijst laden…</p>

  <p v-else-if="list.loaded && list.items.length === 0" class="empty card">
    Je boodschappenlijst is leeg. Voeg ingrediënten toe vanaf een
    <RouterLink to="/">recept</RouterLink>.
  </p>

  <template v-else-if="list.items.length">
    <ul class="items card">
      <li
        v-for="item in list.items"
        :key="item.id"
        :data-id="item.id"
        :class="{ checked: item.checked }"
      >
        <label>
          <input
            type="checkbox"
            :checked="item.checked"
            @change="attempt(() => list.toggle(item.id))"
          />
          <span class="line">{{ itemLine(item) }}</span>
        </label>
        <span v-if="item.source_label" class="sources">uit: {{ item.source_label }}</span>
        <button
          type="button"
          class="remove"
          :aria-label="`${item.name} verwijderen`"
          @click="attempt(() => list.remove(item.id))"
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
        @click="attempt(() => list.clearChecked())"
      >
        Afgevinkte wissen
      </button>
      <button type="button" class="clear-all btn-danger" @click="clearAll">Alles wissen</button>
    </div>
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

.import {
  margin-bottom: var(--space-5);
}
</style>
