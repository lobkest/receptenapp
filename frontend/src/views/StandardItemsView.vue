<script setup>
import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from 'vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import OfflineHint from '@/components/OfflineHint.vue'
import OfflineNotice from '@/components/OfflineNotice.vue'
import StandardItemForm from '@/components/StandardItemForm.vue'
import StandardItemRow from '@/components/StandardItemRow.vue'
import StandardItemsBottomBar from '@/components/StandardItemsBottomBar.vue'
import { useHouseStatus } from '@/composables/useHouseStatus'
import { useTimedMessage } from '@/composables/useTimedMessage'
import { oldestSavedAt } from '@/offline'
import { useOfflineStore } from '@/stores/offline'
import { usePantryStore } from '@/stores/pantry'
import { useServerStatusStore } from '@/stores/serverStatus'
import { useShoppingListStore } from '@/stores/shoppingList'
import { useSnapshotStore } from '@/stores/snapshot'
import { useStandardItemsStore } from '@/stores/standardItems'
import { TEMPORARY_NAME } from '@/utils/temporaryItems'
import { skippedMessage, splitInHouse } from '@/utils/inHouse'

// De items staan op de server (via de store), openbaar: iedereen met de link ziet en
// wijzigt dezelfde lijst. Wat je selecteert en welk item je bewerkt, is alleen state
// van deze pagina. Eén regel is StandardItemRow, de balk onderaan StandardItemsBottomBar.
const standard = useStandardItemsStore()
const shoppingList = useShoppingListStore()
const confirmDialog = useTemplateRef('confirmDialog')
// Offline: de kopie uit de snapshot; toevoegen, bewerken en verwijderen gaan via de outbox.
const offline = useOfflineStore()
const snapshot = useSnapshotStore()
const server = useServerStatusStore()

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

// De boodschappenlijst ook verversen, voor "✓ op lijst", en de voorraad voor het huisje.
// Terug naar de app ververst App.vue ze. Mislukt dat, dan blijft de oude stand staan; de
// boodschappenpagina meldt het, en zonder voorraad zijn er geen huisjes.
const pantry = usePantryStore()
onMounted(() => {
  load()
  shoppingList.load().catch(() => {})
  pantry.loadPantry().catch(() => {})
  standard.loadSuggestions()
})
// Was de server bij openen nog niet online, dan stond de kopie er en ging er geen request
// uit. Nu wel: de verse lijst (een fout als melding; App.vue vraagt tegelijk dezelfde load
// aan, de store doet één request) en "Mogelijk hetzelfde" (alleen van de server).
watch(
  () => server.online,
  (online) => {
    if (!online) return
    load()
    standard.loadSuggestions()
  },
)

// Met een gekoppeld ingrediënt (ingredient_id) matcht het huisje daarop, anders op naam.
const { statusOf } = useHouseStatus()

function inHouse(item) {
  return statusOf(item)?.inHouse ?? false
}

// Zelfde regel als op de receptpagina: een open regel met hetzelfde ingrediënt of (zonder
// ingredient_id aan een van beide kanten) dezelfde naam, van welke herkomst ook. Zo is
// "uien", gekoppeld aan "ui", ook op de lijst als een recept "ui" erop zette.
function onList(item) {
  return shoppingList.listStatus(
    { name: item.name, ingredient_id: item.ingredient_id ?? null },
    null,
  ).onList
}

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
const { message, show: showMessage, hide: hideMessage } = useTimedMessage()

function confirm(text, { toList = false } = {}) {
  showMessage({ text, toList })
}

function countText(count) {
  return count === 1 ? '1 item' : `${count} items`
}

// ---------- Toevoegen en bewerken ----------

const saving = ref(false)
const addErrors = ref({})
// Ophogen geeft het toevoegformulier een nieuwe :key, waardoor het opnieuw begint:
// Naam leeg, de categorie uit addInitial (de laatst gebruikte).
const addFormKey = ref(0)
const addInitial = ref({})

// Het toevoegformulier staat dicht; de +-knop naast de titel opent het (en wordt ×).
const adding = ref(false)
const addPanel = useTemplateRef('addPanel')
const addToggle = useTemplateRef('addToggle')

async function focusAddName() {
  await nextTick()
  addPanel.value?.querySelector('.name')?.focus()
}

function openAdd() {
  addErrors.value = {}
  addInitial.value = {}
  addFormKey.value++
  adding.value = true
  focusAddName()
}

function closeAdd({ refocus = false } = {}) {
  adding.value = false
  if (refocus) addToggle.value?.focus()
}

// Na toevoegen blijft het formulier open, zodat je meteen het volgende item invult.
async function addItem(fields) {
  saving.value = true
  let item
  const ok = await attempt(
    async () => (item = await standard.add(fields)),
    (errors) => (addErrors.value = errors),
  )
  saving.value = false
  if (!ok) return
  // De categorie zoals de server hem bewaarde ("Snoep" → "snoep"), zodat de keuzelijst hem kent.
  addInitial.value = { category: item.category ?? '' }
  addFormKey.value++
  focusAddName()
}

const editingId = ref(null)
const editErrors = ref({})

function startEdit(item) {
  editErrors.value = {}
  editingId.value = item.id
}

// link: het ingrediënt-id uit "Hetzelfde als ingrediënt", null (ontkoppelen) of undefined
// (niet veranderd); na de naam en categorie, want koppelen kijkt naar de nieuwe naam.
async function saveEdit(id, fields, link) {
  saving.value = true
  const ok = await attempt(
    async () => {
      await standard.update(id, fields)
      if (link === null) await standard.unlink(id)
      else if (link !== undefined) await standard.link(id, link)
    },
    (errors) => (editErrors.value = errors),
  )
  saving.value = false
  if (ok) editingId.value = null
}

// ---------- Mogelijk hetzelfde ----------

// Eén regel per paar: "uien ↔ ui", "uien ↔ rode ui".
const suggestionPairs = computed(() =>
  standard.suggestions.flatMap(({ standard_item: item, candidates }) =>
    candidates.map((ingredient) => ({ item, ingredient })),
  ),
)

async function acceptSuggestion({ item, ingredient }) {
  if (await attempt(() => standard.link(item.id, ingredient.id))) {
    confirm(`${item.name} is nu hetzelfde als ${ingredient.name}.`)
  }
}

function rejectSuggestion({ item, ingredient }) {
  attempt(() => standard.rejectLink(item.id, ingredient.id))
}

// ---------- Losse acties per item ----------

// Heeft het item een deel op de lijst dat van de standaardlijst komt? Dan haalt [✓ op lijst]
// dat weg (een aan/uit-knop, zoals op de receptpagina). Staat het er alleen via een recept
// of los, dan zet de knop het er wel bij. Optellen gaat met de stepper op de lijst.
function standardOnList(item) {
  return (
    shoppingList.standardLines({ name: item.name, ingredient_id: item.ingredient_id ?? null })
      .length > 0
  )
}

async function addOne(item) {
  if (standardOnList(item)) {
    if (await attempt(() => shoppingList.removeStandardItems([item]))) {
      confirm(`${item.name} is van je boodschappenlijst gehaald.`, { toList: true })
    }
    return
  }
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
  closeAdd()
  // Een oude bevestiging hoort niet in de selectiebalk.
  hideMessage()
  selecting.value = true
}

function stopSelecting() {
  selecting.value = false
  selected.value = []
}

// Wat in huis is, slaan we over ("5 toegevoegd, 2 al in huis"); [+] per item zet het wel
// op de lijst.
async function addSelected() {
  const chosen = standard.items.filter((item) => selected.value.includes(item.id))
  const { toAdd, inHouse: skipped } = splitInHouse(chosen, statusOf)
  let count = 0
  if (toAdd.length) {
    const ids = toAdd.map((item) => item.id)
    const ok = await attempt(async () => (count = await standard.addToShoppingList(ids)))
    if (!ok) return
  }
  stopSelecting()
  confirm(
    skippedMessage(count, skipped.length) ?? `${countText(count)} op je boodschappenlijst gezet.`,
    { toList: count > 0 },
  )
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
</script>

<template>
  <!-- Wat je ziet komt uit de snapshot (de lijst en de voorraad voor het huisje) en uit de
       boodschappenlijst ("op lijst"): het oudste van die twee tijdstippen. -->
  <OfflineNotice
    v-if="server.offline || (standard.loaded && standard.offline)"
    :saved-at="oldestSavedAt(snapshot.savedAt, shoppingList.savedAt)"
    :pending="offline.pending"
  />

  <div class="title-row">
    <h1 class="page-title">Standaardboodschappen</h1>
    <!-- Rond en gevuld groen: anders dan de lichte [+] ("op lijst") op elke rij. -->
    <button
      v-if="!selecting"
      ref="addToggle"
      type="button"
      class="add-toggle"
      :aria-label="adding ? 'Sluiten' : 'Item toevoegen'"
      :aria-expanded="adding"
      aria-controls="standard-add"
      @click="adding ? closeAdd() : openAdd()"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path v-if="adding" d="M6 6l12 12M18 6L6 18" />
        <path v-else d="M12 5v14M5 12h14" />
      </svg>
    </button>
  </div>

  <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>

  <!-- Bovenaan, dicht: alleen als de server iets vond. Ja koppelt, Nee komt niet terug. -->
  <details v-if="suggestionPairs.length && !selecting" class="card link-suggestions">
    <summary>Mogelijk hetzelfde ({{ suggestionPairs.length }})</summary>
    <p class="muted link-intro">
      Is dit hetzelfde? Dan kloppen het huisje en "✓ op lijst" ook als de namen verschillen.
    </p>
    <ul class="link-list">
      <li
        v-for="pair in suggestionPairs"
        :key="`${pair.item.id}-${pair.ingredient.id}`"
        class="link-pair"
        :data-item-id="pair.item.id"
        :data-ingredient-id="pair.ingredient.id"
      >
        <span class="pair-names">{{ pair.item.name }} ↔ {{ pair.ingredient.name }}</span>
        <span class="pair-actions">
          <button
            type="button"
            class="accept-link"
            :disabled="server.offline"
            :aria-label="`Ja, ${pair.item.name} is hetzelfde als ${pair.ingredient.name}`"
            @click="acceptSuggestion(pair)"
          >
            Ja, hetzelfde
          </button>
          <button
            type="button"
            class="reject-link"
            :disabled="server.offline"
            :aria-label="`Nee, ${pair.item.name} is niet hetzelfde als ${pair.ingredient.name}`"
            @click="rejectSuggestion(pair)"
          >
            Nee
          </button>
        </span>
      </li>
    </ul>
    <OfflineHint v-if="server.offline" />
  </details>

  <section
    v-if="adding"
    id="standard-add"
    ref="addPanel"
    class="card add-card"
    @keydown.esc="closeAdd({ refocus: true })"
  >
    <StandardItemForm
      :key="addFormKey"
      :initial="addInitial"
      submit-label="Toevoegen"
      :categories="standard.categories"
      :errors="addErrors"
      :submitting="saving"
      @save="addItem"
    />
  </section>

  <!-- Met een kopie (snapshot) niet "laden…": die staat er al, ook als het verversen hangt. -->
  <p v-if="loading && !standard.loaded" class="muted">Standaardlijst laden…</p>

  <p v-else-if="standard.loaded && standard.items.length === 0" class="empty card">
    Je hebt nog geen standaardboodschappen. Voeg met + je eerste item toe.
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

  <!-- "Tijdelijk" (group.temporary) is geen categorie: losse items van de boodschappenlijst,
       altijd als laatste. Verplaatsen naar een categorie (bewerken) maakt ze permanent. -->
  <section
    v-for="group in standard.groups"
    :key="group.temporary ? 'temporary' : (group.category ?? '')"
    class="group"
    :class="{ 'group-temporary': group.temporary }"
  >
    <h2>{{ group.temporary ? TEMPORARY_NAME : (group.category ?? 'overig') }}</h2>
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
          :linkable="!item.pending"
          :offline="server.offline"
          @save="(fields, link) => saveEdit(item.id, fields, link)"
          @cancel="editingId = null"
        />

        <StandardItemRow
          v-else
          v-model:selected="selected"
          :item="item"
          :selecting="selecting"
          :on-list="onList(item)"
          :removable="standardOnList(item)"
          :in-house="inHouse(item)"
          @add="addOne"
          @error="error = $event"
          @edit="startEdit"
          @remove="removeOne"
        />
      </li>
    </ul>
  </section>

  <!-- Blijft onderaan in beeld (boven de menubalk), ook als de lijst lang is. -->
  <StandardItemsBottomBar
    v-if="selecting || message"
    :message="message"
    :selecting="selecting"
    :selected-count="selected.length"
    @add-selected="addSelected"
    @remove-selected="removeSelected"
    @stop-selecting="stopSelecting"
  />

  <ConfirmDialog ref="confirmDialog" />
</template>

<style scoped>
/* Titel links, de +-knop rechts op dezelfde regel. */
.title-row {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-3);
}

.title-row .page-title {
  min-width: 0;
  margin: 0;
}

.add-toggle,
.add-toggle:hover:not(:disabled) {
  flex: 0 0 auto;
  width: var(--tap);
  padding: 0;
  color: var(--color-on-brand);
  background: var(--color-brand);
  border-color: var(--color-brand);
  border-radius: var(--radius-full);
}

.add-toggle:hover:not(:disabled) {
  background: var(--color-brand-strong);
  border-color: var(--color-brand-strong);
}

.add-toggle svg {
  width: 22px;
  height: 22px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.5;
  stroke-linecap: round;
}

/* "Standaardboodschappen" is één lang woord: op een telefoon (375–390 px) moet het,
   naast de +-knop, op één regel passen. Daarom schaalt de grootte mee met de
   schermbreedte, en nooit een afbreekstreepje (hyphens: manual, in plaats van auto
   uit main.css). */
.page-title {
  font-size: clamp(var(--text-xl), 5.5vw, var(--text-2xl));
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

.add-card {
  margin-bottom: var(--space-5);
}

/* "Mogelijk hetzelfde": dicht een regel, open de paren met hun knoppen. */
.link-suggestions {
  margin-bottom: var(--space-5);
}

.link-suggestions summary {
  min-height: var(--tap);
  display: flex;
  align-items: center;
  font-weight: 600;
  list-style: none;
  cursor: pointer;
}

/* Met display: flex valt het standaardpijltje weg: een eigen pijl rechts, open naar boven. */
.link-suggestions summary::-webkit-details-marker {
  display: none;
}

.link-suggestions summary::after {
  content: '▾';
  margin-left: auto;
  color: var(--color-text-muted);
}

.link-suggestions[open] summary::after {
  content: '▴';
}

.link-intro {
  margin: var(--space-2) 0;
  font-size: var(--text-sm);
}

.link-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.link-pair {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) 0;
  border-top: 1px solid var(--color-border);
}

.pair-names {
  min-width: 0;
  font-size: var(--text-lg);
  overflow-wrap: anywhere;
}

.pair-actions {
  display: flex;
  flex-shrink: 0;
  gap: var(--space-2);
}

.pair-actions button {
  font-size: var(--text-sm);
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
</style>
