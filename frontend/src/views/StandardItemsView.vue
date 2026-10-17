<script setup>
import { onMounted, ref, useTemplateRef, watch } from 'vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import StandardItemForm from '@/components/StandardItemForm.vue'
import StandardItemRow from '@/components/StandardItemRow.vue'
import StandardItemsBottomBar from '@/components/StandardItemsBottomBar.vue'
import { useHouseStatus } from '@/composables/useHouseStatus'
import { useTimedMessage } from '@/composables/useTimedMessage'
import { usePantryStore } from '@/stores/pantry'
import { useShoppingListStore } from '@/stores/shoppingList'
import { useStandardItemsStore } from '@/stores/standardItems'
import { skippedMessage, splitInHouse } from '@/utils/inHouse'

// De items staan op de server (via de store), openbaar: iedereen met de link ziet en
// wijzigt dezelfde lijst. Wat je selecteert en welk item je bewerkt, is alleen state
// van deze pagina. Eén regel is StandardItemRow, de balk onderaan StandardItemsBottomBar.
const standard = useStandardItemsStore()
const shoppingList = useShoppingListStore()
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

// De boodschappenlijst ook verversen, voor "✓ op lijst", en de voorraad voor het huisje.
// Terug naar de app ververst App.vue ze. Mislukt dat, dan blijft de oude stand staan; de
// boodschappenpagina meldt het, en zonder voorraad zijn er geen huisjes.
const pantry = usePantryStore()
onMounted(() => {
  load()
  shoppingList.load().catch(() => {})
  pantry.loadPantry().catch(() => {})
})

// Een standaarditem heeft geen ingredient_id: het huisje matcht op naam.
const { statusOf } = useHouseStatus()

function inHouse(item) {
  return statusOf(item)?.inHouse ?? false
}

// Zelfde regel als op de receptpagina: een open regel met dezelfde naam, van welke
// herkomst ook. Een standaarditem heeft geen ingredient_id, dus telt de naam.
function onList(item) {
  return shoppingList.listStatus({ name: item.name }, null).onList
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
  const already = onList(item)
  if (await attempt(() => standard.addToShoppingList([item.id]))) {
    const text = already
      ? `Nog een ${item.name} op je boodschappenlijst.`
      : `${item.name} staat op je boodschappenlijst.`
    confirm(text, { toList: true })
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
  <h1 class="page-title">Standaardboodschappen</h1>

  <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>

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

        <StandardItemRow
          v-else
          v-model:selected="selected"
          :item="item"
          :selecting="selecting"
          :on-list="onList(item)"
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
</style>
