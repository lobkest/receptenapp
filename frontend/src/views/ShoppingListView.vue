<script setup>
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import CountStepper from '@/components/CountStepper.vue'
import OfflineNotice from '@/components/OfflineNotice.vue'
import ShoppingListAddField from '@/components/ShoppingListAddField.vue'
import ShoppingListRecipes from '@/components/ShoppingListRecipes.vue'
import { useOfflineStore } from '@/stores/offline'
import { useServerStatusStore } from '@/stores/serverStatus'
import { useShoppingListStore } from '@/stores/shoppingList'
import { countOf, shoppingListLine, shoppingListSource } from '@/utils/shoppingListLine'
import { categorySections, groupByRecipe, removeRecipeQuestion } from '@/utils/shoppingListRecipes'

// De lijst staat op de server (via de store), gedeeld met iedereen die de link heeft.
// Bij openen van deze pagina halen we hem opnieuw op; bij terugschakelen naar de app
// of als de server (weer) online is doet App.vue dat. Zolang de server niet online is (ook
// vlak na het openen, terwijl hij wakker wordt) toont de store de laatst opgeslagen kopie met
// de offline-melding erboven; afvinken, het aantal, verwijderen en toevoegen werken dan gewoon
// (via de outbox, stores/offline.js, zonder request). Wat nog op sync wacht, staat er met
// "wacht op sync" bij. Zodra /up 200 geeft, gaat de outbox weg en verdwijnt de melding.
const list = useShoppingListStore()
const server = useServerStatusStore()
const offline = useOfflineStore()
// Wissen en recept verwijderen kunnen alleen online: uit als de lijst offline is, of zolang de
// server niet online is.
const noServer = computed(() => list.offline || server.offline)

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

// Een fout van tijdens het wakker worden (bijv. een 502) geldt niet meer zodra de verse
// lijst er is.
watch(
  () => list.fresh,
  (fresh) => {
    if (fresh) error.value = null
  },
)

onMounted(async () => {
  // "Laden…" alleen als er nog niets te tonen is. load() zet een opgeslagen kopie er
  // meteen neer (vóór het request); die staat er dan al tijdens het verversen.
  const loadingList = list.load()
  loading.value = !list.loaded
  await attempt(() => loadingList)
  loading.value = false
})

// "Groepeer per recept": de stand staat in de URL (?groep=recept), niet in localStorage.
// Zo blijft hij na herladen staan en kun je de link delen; de knop Terug van de browser
// springt er niet doorheen (replace in plaats van push).
const route = useRoute()
const router = useRouter()
const grouped = computed(() => route.query.groep === 'recept')

function setGrouped(on) {
  router.replace({ query: { ...route.query, groep: on ? 'recept' : undefined } })
}

// "Afgevinkt onderaan": een weergave-instelling per apparaat, daarom (bewust) in localStorage
// en niet op de server. Lezen en schrijven in try/catch: in een privévenster kan dat falen.
const CHECKED_BOTTOM_KEY = 'receptenapp:afgevinktOnderaan'

function readCheckedBottom() {
  try {
    return localStorage.getItem(CHECKED_BOTTOM_KEY) === '1'
  } catch {
    return false
  }
}

const checkedBottom = ref(readCheckedBottom())

function setCheckedBottom(on) {
  checkedBottom.value = on
  try {
    if (on) localStorage.setItem(CHECKED_BOTTOM_KEY, '1')
    else localStorage.removeItem(CHECKED_BOTTOM_KEY)
  } catch {
    // Niet te bewaren: dan geldt de stand alleen tot herladen.
  }
}

// Net afgevinkt: blijft nog MOVE_DELAY ms op zijn plek (zie je wat je deed, en kun je het
// terugdraaien), pas daarna gaat hij naar "In je mandje". Weer open binnen die tijd: dan
// verplaatst hij niet.
const MOVE_DELAY = 800
const justChecked = ref(new Set())
const moveTimers = new Map()

function forgetJustChecked(id) {
  clearTimeout(moveTimers.get(id))
  moveTimers.delete(id)
  if (justChecked.value.has(id)) {
    const next = new Set(justChecked.value)
    next.delete(id)
    justChecked.value = next
  }
}

function toggle(item) {
  forgetJustChecked(item.id)
  if (checkedBottom.value && !item.checked) {
    justChecked.value = new Set(justChecked.value).add(item.id)
    moveTimers.set(
      item.id,
      setTimeout(() => forgetJustChecked(item.id), MOVE_DELAY),
    )
  }
  attempt(() => list.toggle(item.id))
}

onBeforeUnmount(() => moveTimers.forEach((timer) => clearTimeout(timer)))

// In het mandje: afgevinkt en niet meer "net afgevinkt".
const inBasket = (item) => item.checked && !justChecked.value.has(item.id)

// Het mandje is standaard ingeklapt (niet onthouden: bij elk bezoek weer dicht).
const basketOpen = ref(false)

// Gewoon: een sectie per categorie van de standaardlijst ("bakken", "zuivel"), zoals de
// afdelingen in de winkel, en "overig" als laatste. Per recept: een sectie per recept en
// daarna "Los / standaardlijst". Binnen een sectie de gewone volgorde.
// Met "Afgevinkt onderaan" alleen de open regels in die secties (een sectie zonder open regels
// valt weg) en alle afgevinkte samen in één sectie "In je mandje" als laatste.
const sections = computed(() => {
  const sectionsOf = (items) => (grouped.value ? groupByRecipe(items) : categorySections(items))
  if (!checkedBottom.value) return sectionsOf(list.items)
  const open = sectionsOf(list.items.filter((item) => !inBasket(item))).filter(
    (section) => section.items.length,
  )
  const basket = list.items.filter(inBasket)
  if (!basket.length) return open
  return [
    ...open,
    { key: 'mandje', title: `In je mandje (${basket.length})`, basket: true, items: basket },
  ]
})

const confirmDialog = useTemplateRef('confirmDialog')

// "Iets toevoegen…" (ShoppingListAddField): een los item, ook offline.
function addLoose({ name, ingredientId, count }) {
  attempt(() => list.addLoose(name, { ingredientId, count }))
}

async function removeRecipe(recipe) {
  const sure = await confirmDialog.value.ask(removeRecipeQuestion(recipe))
  if (sure) attempt(() => list.removeRecipe(recipe))
}

async function clearAll() {
  const sure = await confirmDialog.value.ask({
    title: 'De hele boodschappenlijst wissen?',
    text: 'Alle regels verdwijnen, ook de afgevinkte. Ook voor iedereen met wie je de lijst deelt.',
  })
  if (sure) attempt(() => list.clearAll())
}
</script>

<template>
  <!-- De offline-melding staat op elke pagina als eerste, boven de kop, alleen zonder
       verbinding. Nog geen kopie: dan is er niets te tonen. De uitleg en de wachtende
       wijzigingen staan eronder (OfflineNotice). -->
  <OfflineNotice
    v-if="server.offline && !list.loaded"
    unavailable="Boodschappen"
    :pending="offline.pending"
  />
  <OfflineNotice
    v-else-if="server.offline || list.offline"
    :saved-at="list.savedAt"
    :pending="offline.pending"
  >
    <template #default>
      Afvinken, het aantal, verwijderen en toevoegen kan gewoon; dat gaat naar de server zodra je
      weer verbinding hebt. Wissen kan pas weer online.
    </template>
  </OfflineNotice>

  <h1>Boodschappen</h1>

  <ShoppingListAddField v-if="list.loaded || !loading" @add="addLoose" />

  <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>

  <!-- Nog geen kopie en de server is niet online: alleen de offline-melding hierboven
       (met de teller), geen "laden…" erbij. -->
  <p v-if="loading && !server.offline" class="muted">Boodschappenlijst laden…</p>

  <p v-else-if="list.loaded && list.items.length === 0" class="empty card">
    Je boodschappenlijst is leeg. Typ hierboven wat je nodig hebt, of voeg ingrediënten toe vanaf
    een <RouterLink to="/">recept</RouterLink>.
  </p>

  <template v-else-if="list.items.length">
    <!-- Klein en rechts boven de lijst: de weergaveknoppen. -->
    <div class="view-toggles">
      <button
        type="button"
        class="view-chip checked-bottom"
        :aria-pressed="checkedBottom"
        @click="setCheckedBottom(!checkedBottom)"
      >
        <span v-if="checkedBottom" aria-hidden="true">✓</span> Afgevinkt onderaan
      </button>
      <button v-if="grouped" type="button" class="ungroup" @click="setGrouped(false)">
        Groepering uit
      </button>
    </div>

    <!-- Met "Afgevinkt onderaan" schuiven regels en secties zacht op hun nieuwe plek
         (TransitionGroup, de move-class); zonder die knop gewoon zoals altijd, zonder
         animatie (de naam "geen" heeft geen CSS). -->
    <TransitionGroup :name="checkedBottom ? 'shift' : 'geen'" tag="div" class="sections">
      <section
        v-for="section in sections"
        :key="section.key"
        class="section"
        :class="{ basket: section.basket }"
      >
        <!-- "In je mandje (n)": de kop is de knop om uit en in te klappen. -->
        <h2 v-if="section.basket" class="section-title">
          <button
            type="button"
            class="basket-toggle"
            :aria-expanded="basketOpen"
            aria-controls="mandje"
            @click="basketOpen = !basketOpen"
          >
            <span class="basket-arrow" aria-hidden="true">{{ basketOpen ? '▾' : '▸' }}</span>
            {{ section.title }}
          </button>
        </h2>
        <h2
          v-else-if="section.title"
          :class="section.category ? 'category-title' : 'section-title'"
        >
          {{ section.title }}
        </h2>
        <TransitionGroup
          v-if="!section.basket || basketOpen"
          :id="section.basket ? 'mandje' : undefined"
          :name="checkedBottom ? 'shift' : 'geen'"
          tag="ul"
          class="items card"
        >
          <li
            v-for="item in section.items"
            :key="item.id"
            :data-id="item.id"
            :class="{ checked: item.checked, pending: item.pending }"
          >
            <label>
              <!-- locked: de server rekent bij de sync welke regels het worden; pas daarna
                   af te strepen, te wijzigen of weg te halen. -->
              <input
                type="checkbox"
                :checked="item.checked"
                :disabled="item.locked"
                @change="toggle(item)"
              />
              <!-- De herkomst klein op een tweede regel, zonder "uit:". Te lang? Dan kapt hij af
                   met "…"; de volledige herkomst staat in de tooltip. Gegroepeerd per recept staat
                   hij al in de sectiekop, dan niet nog eens (behalve in het mandje). Los getypt:
                   geen tweede regel. -->
              <span class="text">
                <span class="line">{{ shoppingListLine(item) }}</span>
                <span
                  v-if="(!grouped || section.basket) && shoppingListSource(item)"
                  class="sources"
                  :title="`uit: ${shoppingListSource(item)}`"
                  >{{ shoppingListSource(item) }}</span
                >
                <span v-if="item.pending" class="pending-mark">wacht op sync</span>
              </span>
            </label>
            <div class="line-actions">
              <!-- Het aantal; bij een afgevinkte regel valt er niets meer te kiezen. -->
              <CountStepper
                :count="countOf(item)"
                :name="item.name"
                :disabled="item.checked || item.locked"
                @change="(count) => attempt(() => list.setCount(item.id, count))"
              />
              <button
                type="button"
                class="remove"
                :disabled="item.locked"
                :aria-label="`${item.name} verwijderen`"
                @click="attempt(() => list.remove(item.id))"
              >
                ✕
              </button>
            </div>
          </li>
        </TransitionGroup>
      </section>
    </TransitionGroup>

    <div class="actions">
      <button
        type="button"
        class="clear-checked"
        :disabled="noServer || !list.hasChecked"
        @click="attempt(() => list.clearChecked())"
      >
        Afgevinkte wissen
      </button>
      <button type="button" class="clear-all btn-danger" :disabled="noServer" @click="clearAll">
        Alles wissen
      </button>
    </div>

    <ShoppingListRecipes
      v-if="list.recipesOnList.length"
      :recipes="list.recipesOnList"
      :grouped="grouped"
      :offline="noServer"
      @update:grouped="setGrouped"
      @remove="removeRecipe"
    />
  </template>

  <ConfirmDialog ref="confirmDialog" />
</template>

<style scoped>
/* De weergaveknoppen klein en rechts boven de lijst, naast elkaar. */
.view-toggles {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-2);
  margin: 0 0 var(--space-2);
}

/* "Groepering uit": voor wie de groepering weer uit wil zonder te scrollen. */
.ungroup {
  min-height: 0;
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-sm);
}

/* "Afgevinkt onderaan" als de filter-chips op het receptentabblad: uit een omlijnde pil,
   aan groen gevuld met ✓. */
.view-chip {
  gap: var(--space-1);
  min-height: 0;
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text);
  background: var(--color-surface);
  border-color: var(--color-border-strong);
  border-radius: var(--radius-full);
}

.view-chip[aria-pressed='true'] {
  color: var(--color-on-brand);
  background: var(--color-brand);
  border-color: var(--color-brand);
}

.view-chip[aria-pressed='true']:hover {
  color: var(--color-on-brand);
  background: var(--color-brand-strong);
}

/* "In je mandje (n)": de hele kop is de knop, zonder knoplook. */
.basket-toggle {
  gap: var(--space-2);
  min-height: var(--tap);
  padding: 0;
  font: inherit;
  color: inherit;
  background: transparent;
  border-color: transparent;
}

/* Geen groene pil bij hover: op een telefoon blijft die na tikken hangen. */
.basket-toggle:hover:not(:disabled) {
  color: inherit;
  background: transparent;
}

.basket-arrow {
  display: inline-block;
  width: 1em;
}

/* Verschuiven met "Afgevinkt onderaan": wat blijft schuift zacht op (move), wat weggaat
   vervaagt en telt niet meer mee in de opmaak (absolute), zodat de rest meteen kan
   opschuiven in plaats van te verspringen. */
.items,
.sections {
  position: relative;
}

.shift-move,
.shift-enter-active,
.shift-leave-active {
  transition:
    transform 0.3s ease,
    opacity 0.3s ease;
}

.shift-enter-from,
.shift-leave-to {
  opacity: 0;
}

.items > .shift-leave-active {
  position: absolute;
  right: var(--space-4);
  left: var(--space-4);
}

.sections > .shift-leave-active {
  position: absolute;
  right: 0;
  left: 0;
}

@media (prefers-reduced-motion: reduce) {
  .shift-move,
  .shift-enter-active,
  .shift-leave-active {
    transition: none;
  }
}

.section + .section {
  margin-top: var(--space-4);
}

.section-title {
  margin: 0 0 var(--space-2);
  font-size: var(--text-base);
  color: var(--color-text-muted);
}

/* Categorie als klein kopje, zoals op de standaardlijst: een afdeling in de winkel. */
.category-title {
  margin: 0 0 var(--space-1);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.items {
  margin: 0;
  padding: 0 var(--space-4);
  list-style: none;
}

.items li {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  column-gap: var(--space-1);
  padding: 2px 0;
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
  /* Minstens 44 px hoog (de richtlijn van Apple), net als de stepperknoppen ernaast: de rij
     wordt er niet hoger van. */
  min-height: max(var(--tap), 44px);
  font-weight: 400;
  font-size: var(--text-base);
  line-height: 1.3;
  cursor: pointer;
}

.items input[type='checkbox'] {
  flex-shrink: 0;
}

/* Naam boven, herkomst klein eronder. Het blok neemt alle ruimte tussen vinkje en stepper
   (flex: 1) en mag krimpen (min-width: 0), zodat de herkomst afkapt in plaats van onder de
   stepper door te lopen. Zonder herkomst is het één regel, verticaal gecentreerd. */
.text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.items label {
  min-width: 0;
}

/* Een lange naam loopt door over meerdere regels (ook een lang woord breekt af). */
.line {
  overflow-wrap: anywhere;
}

.sources {
  overflow: hidden;
  font-size: 0.72rem;
  line-height: 1.2;
  color: var(--color-text-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Stepper en ✕ zo smal mogelijk, zodat de naam de ruimte krijgt. De ✕ staat vlak naast de
   stepper (het glyph links in zijn knop); het tikvlak (44×44) loopt onzichtbaar door in de binnenrand van de kaart
   (negatieve marge), zodat hij in de regel maar weinig plek inneemt. */
.line-actions {
  display: flex;
  align-items: center;
  margin-right: calc(-1 * var(--space-3));
}

.remove {
  justify-content: flex-start;
  width: max(var(--tap), 44px);
  min-width: max(var(--tap), 44px);
  min-height: max(var(--tap), 44px);
  padding: 0 0 0 var(--space-1);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  background: transparent;
  border-color: transparent;
}

/* Nog niet bij de server: klein en schuin, op een eigen regel onder de naam. */
.pending-mark {
  line-height: 1.2;
  font-size: var(--text-xs);
  font-style: italic;
  color: var(--color-text-muted);
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
</style>
