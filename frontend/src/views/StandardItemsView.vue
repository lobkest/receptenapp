<script setup>
import { onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'
import { RouterLink } from 'vue-router'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import StandardItemForm from '@/components/StandardItemForm.vue'
import { useStandardItemsStore } from '@/stores/standardItems'

// De items staan op de server (via de store), openbaar: iedereen met de link ziet en
// wijzigt dezelfde lijst. Wat je selecteert en welk item je bewerkt, is alleen state
// van deze pagina.
const standard = useStandardItemsStore()
const confirmDialog = useTemplateRef('confirmDialog')

const loading = ref(false)
// Melding bij een mislukte actie (netwerk, server). Validatiefouten staan bij het veld.
const error = ref(null)

async function load() {
  loading.value = true
  error.value = null
  try {
    await standard.load()
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

onMounted(load)

// Voert een actie uit; een validatiefout gaat naar setErrors (bij het formulier),
// elke andere fout bovenaan de pagina. Geeft true als het gelukt is.
async function attempt(action, setErrors = () => {}) {
  error.value = null
  try {
    await action()
    setErrors({})
    return true
  } catch (e) {
    if (e.kind === 'validation') {
      setErrors(e.errors)
    } else {
      error.value = e.message
    }
    return false
  }
}

// Korte bevestiging onderaan, zoals op de receptpagina. toList: het ging om de
// boodschappenlijst, dus een link "Bekijk lijst" erachter; na verwijderen niet.
const message = ref(null)
let messageTimer = null

function confirm(text, { toList = false } = {}) {
  message.value = { text, toList }
  clearTimeout(messageTimer)
  messageTimer = setTimeout(() => (message.value = null), 3000)
}

onUnmounted(() => clearTimeout(messageTimer))

function countText(count) {
  return count === 1 ? '1 item' : `${count} items`
}

// ---------- Toevoegen en bewerken ----------

const saving = ref(false)
const addErrors = ref({})
// Ophogen geeft het toevoegformulier een nieuwe :key, waardoor het leeg opnieuw begint.
const addFormKey = ref(0)

async function addItem(fields) {
  saving.value = true
  const ok = await attempt(
    () => standard.add(fields),
    (errors) => (addErrors.value = errors),
  )
  saving.value = false
  if (ok) addFormKey.value++
}

const editingId = ref(null)
const editErrors = ref({})

function startEdit(item) {
  editErrors.value = {}
  editingId.value = item.id
}

async function saveEdit(id, fields) {
  saving.value = true
  const ok = await attempt(
    () => standard.update(id, fields),
    (errors) => (editErrors.value = errors),
  )
  saving.value = false
  if (ok) editingId.value = null
}

// ---------- Losse acties per item ----------

async function addOne(item) {
  if (await attempt(() => standard.addToShoppingList([item.id]))) {
    confirm(`${item.name} staat op je boodschappenlijst.`, { toList: true })
  }
}

async function removeOne(item) {
  if (!(await confirmDialog.value.ask({ title: `${item.name} verwijderen?` }))) return
  if (await attempt(() => standard.remove(item.id))) confirm(`${item.name} is verwijderd.`)
}

// ---------- Selectiemodus ----------

const selecting = ref(false)
const selected = ref([])

function startSelecting() {
  editingId.value = null
  // Een oude bevestiging hoort niet in de selectiebalk.
  clearTimeout(messageTimer)
  message.value = null
  selecting.value = true
}

function stopSelecting() {
  selecting.value = false
  selected.value = []
}

async function addSelected() {
  let count = 0
  const ok = await attempt(async () => (count = await standard.addToShoppingList(selected.value)))
  if (!ok) return
  stopSelecting()
  confirm(`${countText(count)} op je boodschappenlijst gezet.`, { toList: true })
}

async function removeSelected() {
  const title = `${countText(selected.value.length)} verwijderen?`
  if (!(await confirmDialog.value.ask({ title }))) return

  let count = 0
  const ok = await attempt(async () => (count = await standard.removeMany(selected.value)))
  if (!ok) return
  stopSelecting()
  confirm(`${countText(count)} verwijderd.`)
}

// Zonder items valt er niets te selecteren (bijv. na alles verwijderen).
watch(
  () => standard.items.length,
  (length) => length === 0 && stopSelecting(),
)

// ---------- Import van de oude lijst ----------

const importing = ref(false)

async function importLegacy() {
  importing.value = true
  let result
  const ok = await attempt(async () => (result = await standard.importLegacy()))
  importing.value = false
  if (!ok) return
  const skipped = result.skipped ? `, ${result.skipped} overgeslagen (stonden er al)` : ''
  confirm(`${countText(result.imported)} geïmporteerd${skipped}.`)
}
</script>

<template>
  <h1 class="page-title">Standaardboodschappen</h1>

  <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>

  <div v-if="standard.legacyItems.length && standard.loaded" class="import card">
    <p>
      In deze browser staat nog een oude standaardlijst ({{
        countText(standard.legacyItems.length)
      }}). Zet hem op de server; wat er al staat, wordt overgeslagen.
    </p>
    <button type="button" class="import-legacy" :disabled="importing" @click="importLegacy">
      Lijst uit deze browser importeren
    </button>
  </div>

  <section class="card add-card">
    <h2>Item toevoegen</h2>
    <StandardItemForm
      :key="addFormKey"
      submit-label="Toevoegen"
      :categories="standard.categories"
      :errors="addErrors"
      :submitting="saving"
      @save="addItem"
    />
  </section>

  <p v-if="loading" class="muted">Standaardlijst laden…</p>

  <p v-else-if="standard.loaded && standard.items.length === 0" class="empty card">
    Je hebt nog geen standaardboodschappen. Voeg hierboven je eerste item toe.
  </p>

  <!-- Rechtsboven de lijst, niet naast de titel: daar zou "Standaardboodschappen"
       op een telefoon over drie regels afbreken. -->
  <div v-if="standard.items.length" class="list-toolbar">
    <span class="muted">{{ countText(standard.items.length) }}</span>
    <button v-if="!selecting" type="button" class="start-selecting" @click="startSelecting">
      Selecteren
    </button>
    <span v-else class="muted">Kies items</span>
  </div>

  <section v-for="group in standard.groups" :key="group.category ?? ''" class="group">
    <h2>{{ group.category ?? 'overig' }}</h2>
    <ul class="items card">
      <li v-for="item in group.items" :key="item.id" :data-id="item.id">
        <StandardItemForm
          v-if="editingId === item.id"
          :initial="item"
          submit-label="Opslaan"
          cancellable
          :categories="standard.categories"
          :errors="editErrors"
          :submitting="saving"
          @save="saveEdit(item.id, $event)"
          @cancel="editingId = null"
        />

        <label v-else-if="selecting" class="row select">
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
              @click="addOne(item)"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            <button
              type="button"
              class="icon edit"
              :aria-label="`${item.name} bewerken`"
              @click="startEdit(item)"
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
              @click="removeOne(item)"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
              </svg>
            </button>
          </div>
        </div>
      </li>
    </ul>
  </section>

  <!-- Blijft onderaan in beeld (boven de menubalk), ook als de lijst lang is. -->
  <div v-if="selecting || message" class="bottom-bar card">
    <p v-if="message" class="added notice notice-success" role="status">
      {{ message.text }}
      <RouterLink v-if="message.toList" to="/boodschappen">Bekijk lijst</RouterLink>
    </p>
    <div v-if="selecting" class="selection-actions">
      <button
        type="button"
        class="add-selected btn-primary"
        :disabled="selected.length === 0"
        @click="addSelected"
      >
        Op lijst ({{ selected.length }})
      </button>
      <button
        type="button"
        class="remove-selected btn-danger"
        :disabled="selected.length === 0"
        @click="removeSelected"
      >
        Verwijderen ({{ selected.length }})
      </button>
      <button type="button" class="stop-selecting" @click="stopSelecting">Annuleren</button>
    </div>
  </div>

  <ConfirmDialog ref="confirmDialog" />
</template>

<style scoped>
/* "Standaardboodschappen" is één lang woord: op een telefoon (375–390 px) moet het op
   één regel passen. Daarom schaalt de grootte mee met de schermbreedte, en nooit een
   afbreekstreepje (hyphens: manual, in plaats van auto uit main.css). */
.page-title {
  font-size: clamp(var(--text-xl), 6.5vw, var(--text-2xl));
  -webkit-hyphens: manual;
  hyphens: manual;
}

.list-toolbar {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  justify-content: space-between;
  min-height: var(--tap);
  margin-bottom: var(--space-3);
}

.start-selecting {
  font-size: var(--text-sm);
}

.import,
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
  padding: 0 var(--space-3);
  list-style: none;
}

.items li {
  padding: var(--space-1) 0;
  border-bottom: 1px solid var(--color-border);
}

.items li:has(> form) {
  padding: var(--space-3) 0;
}

.items li:last-child {
  border-bottom: 0;
}

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
