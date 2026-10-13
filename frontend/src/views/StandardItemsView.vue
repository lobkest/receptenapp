<script setup>
import { computed, onUnmounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import StandardItemForm from '@/components/StandardItemForm.vue'
import { useStandardItemsStore } from '@/stores/standardItems'
import { formatQuantity } from '@/utils/quantity'

// De items zelf staan in de store (en dus in localStorage). Wat je selecteert en
// welk item je bewerkt, is alleen state van deze pagina en wordt niet bewaard.
const standard = useStandardItemsStore()

const selected = ref([])
const editingId = ref(null)
// Ophogen geeft het toevoegformulier een nieuwe :key, waardoor het leeg opnieuw begint.
const addFormKey = ref(0)

const allSelected = computed(
  () => standard.items.length > 0 && selected.value.length === standard.items.length,
)

function itemLine(item) {
  if (item.quantity == null) return item.name
  return `${formatQuantity(item.quantity)} ${item.unit} ${item.name}`
}

function isSelected(id) {
  return selected.value.includes(id)
}

function toggleSelected(id) {
  selected.value = isSelected(id) ? selected.value.filter((s) => s !== id) : [...selected.value, id]
}

function toggleAll() {
  selected.value = allSelected.value ? [] : standard.items.map((i) => i.id)
}

// Zelfde korte bevestiging als op de receptpagina.
const message = ref(null)
let messageTimer = null

function confirm(text) {
  message.value = text
  clearTimeout(messageTimer)
  messageTimer = setTimeout(() => (message.value = null), 3000)
}

onUnmounted(() => clearTimeout(messageTimer))

function addItem(fields) {
  if (standard.add(fields)) addFormKey.value++
}

function saveEdit(id, fields) {
  if (standard.update(id, fields)) editingId.value = null
}

function remove(item) {
  standard.remove(item.id)
  selected.value = selected.value.filter((s) => s !== item.id)
}

function addOne(item) {
  standard.addToShoppingList([item.id])
  confirm(`${item.name} staat op je boodschappenlijst.`)
}

function addSelected() {
  const count = standard.addToShoppingList(selected.value)
  selected.value = []
  confirm(
    count === 1
      ? '1 item staat op je boodschappenlijst.'
      : `${count} items staan op je boodschappenlijst.`,
  )
}
</script>

<template>
  <h1>Standaardboodschappen</h1>
  <p class="muted">Wat je vaak koopt. Zet het met één tik op je boodschappenlijst.</p>

  <section class="card add-card">
    <h2>Item toevoegen</h2>
    <StandardItemForm :key="addFormKey" submit-label="Toevoegen" @save="addItem" />
  </section>

  <div v-if="standard.items.length === 0" class="empty card">
    <p>Je hebt nog geen standaardboodschappen.</p>
    <button type="button" class="load-example" @click="standard.loadExample()">
      Voorbeeldlijst laden
    </button>
  </div>

  <template v-else>
    <section v-for="group in standard.groups" :key="group.category ?? ''" class="group">
      <h2>{{ group.category ?? 'overig' }}</h2>
      <ul class="items card">
        <li v-for="item in group.items" :key="item.id" :data-id="item.id">
          <StandardItemForm
            v-if="editingId === item.id"
            :initial="item"
            submit-label="Opslaan"
            cancellable
            @save="saveEdit(item.id, $event)"
            @cancel="editingId = null"
          />
          <template v-else>
            <label class="select">
              <input
                type="checkbox"
                :checked="isSelected(item.id)"
                @change="toggleSelected(item.id)"
              />
              <span class="line">{{ itemLine(item) }}</span>
            </label>
            <div class="item-actions">
              <button
                type="button"
                class="add-one"
                :aria-label="`${item.name} op boodschappenlijst`"
                @click="addOne(item)"
              >
                Op lijst
              </button>
              <button
                type="button"
                class="edit"
                :aria-label="`${item.name} bewerken`"
                @click="editingId = item.id"
              >
                Bewerken
              </button>
              <button
                type="button"
                class="remove btn-danger"
                :aria-label="`${item.name} verwijderen`"
                @click="remove(item)"
              >
                Verwijderen
              </button>
            </div>
          </template>
        </li>
      </ul>
    </section>
  </template>

  <!-- Blijft onderaan in beeld (boven de menubalk), ook als de lijst lang is. -->
  <div v-if="standard.items.length || message" class="bulk card">
    <p v-if="message" class="added notice notice-success" role="status">
      {{ message }} <RouterLink to="/boodschappen">Bekijk lijst</RouterLink>
    </p>
    <div v-if="standard.items.length" class="bulk-actions">
      <button type="button" class="toggle-all" @click="toggleAll">
        {{ allSelected ? 'Selectie wissen' : 'Alles selecteren' }}
      </button>
      <button
        type="button"
        class="add-selected btn-primary"
        :disabled="selected.length === 0"
        @click="addSelected"
      >
        Geselecteerde op lijst<template v-if="selected.length"> ({{ selected.length }})</template>
      </button>
    </div>
  </div>

  <p class="hint muted">Deze lijst staat alleen in deze browser op dit apparaat.</p>
</template>

<style scoped>
.add-card {
  margin-bottom: var(--space-5);
}

.empty {
  text-align: center;
}

.group {
  margin-bottom: var(--space-5);
}

/* Categorie als klein kopje, zoals een afdeling in de winkel. */
.group h2 {
  margin-bottom: var(--space-2);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.items {
  margin: 0;
  padding: 0 var(--space-4);
  list-style: none;
}

.items li {
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--color-border);
}

.items li:last-child {
  border-bottom: 0;
}

.select {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  min-height: var(--tap);
  font-size: var(--text-lg);
  font-weight: 400;
  cursor: pointer;
}

.select input {
  flex-shrink: 0;
}

/* Mobiel: knoppen op een eigen regel onder de naam, even breed. */
.item-actions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.item-actions button {
  padding: var(--space-1) var(--space-2);
  font-size: var(--text-sm);
}

.add-one {
  color: var(--color-brand);
}

/* Breed: naam links, knoppen rechts op dezelfde regel. */
@media (min-width: 40rem) {
  .items li:has(> .select) {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .select {
    flex: 1;
  }

  .item-actions {
    display: flex;
    margin-top: 0;
  }
}

.bulk {
  position: sticky;
  bottom: calc(var(--nav-height) + env(safe-area-inset-bottom) + var(--space-2));
  z-index: 5;
  margin-top: var(--space-4);
  padding: var(--space-3);
  box-shadow: var(--shadow);
}

@media (min-width: 40rem) {
  .bulk {
    bottom: var(--space-3);
  }
}

.added {
  margin-bottom: var(--space-3);
}

.added a {
  color: inherit;
  font-weight: 600;
}

.bulk-actions {
  display: flex;
  gap: var(--space-2);
}

.bulk-actions button {
  flex: 1 1 auto;
}

.hint {
  margin-top: var(--space-4);
  font-size: var(--text-sm);
}
</style>
