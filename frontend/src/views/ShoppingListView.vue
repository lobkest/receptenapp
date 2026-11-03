<script setup>
import { computed, onMounted, ref, useTemplateRef, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import CountStepper from '@/components/CountStepper.vue'
import OfflineNotice from '@/components/OfflineNotice.vue'
import ServerWaiting from '@/components/ServerWaiting.vue'
import ShoppingListAddField from '@/components/ShoppingListAddField.vue'
import ShoppingListRecipes from '@/components/ShoppingListRecipes.vue'
import { useOfflineStore } from '@/stores/offline'
import { useServerStatusStore } from '@/stores/serverStatus'
import { useShoppingListStore } from '@/stores/shoppingList'
import { countOf, shoppingListLine, shoppingListSource } from '@/utils/shoppingListLine'
import { categorySections, groupByRecipe, removeRecipeQuestion } from '@/utils/shoppingListRecipes'

// De lijst staat op de server (via de store), gedeeld met iedereen die de link heeft.
// Bij openen van deze pagina halen we hem opnieuw op; bij terugschakelen naar de app
// of als de verbinding terugkomt doet App.vue dat. Offline toont de store de laatst
// opgeslagen kopie; afvinken, het aantal, verwijderen en toevoegen werken dan gewoon (via de
// outbox, stores/offline.js). Wat nog op sync wacht, staat er met "wacht op sync" bij.
// Bij openen staat de offline kopie er meteen, met "Offline kopie van 28 okt om 14:05, bijwerken…"
// erboven; zodra de verse lijst binnen is (list.fresh), verdwijnt die melding.
const list = useShoppingListStore()
const server = useServerStatusStore()
const offline = useOfflineStore()

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

// Gewoon: een sectie per categorie van de standaardlijst ("bakken", "zuivel"), zoals de
// afdelingen in de winkel, en "overig" als laatste. Per recept: een sectie per recept en
// daarna "Los / standaardlijst". Binnen een sectie de gewone volgorde.
const sections = computed(() =>
  grouped.value ? groupByRecipe(list.items) : categorySections(list.items),
)

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
  <!-- De offline-melding staat op elke pagina als eerste, boven de kop. Nog geen kopie en
       geen verbinding: dan is er niets te tonen. -->
  <OfflineNotice
    v-if="loading && server.offline"
    no-copy
    :offline="server.browserOffline"
    unavailable="Boodschappen"
  />
  <OfflineNotice
    v-else-if="
      (list.loaded && (!list.fresh || list.offline || server.offline)) || offline.pending > 0
    "
    :saved-at="list.savedAt"
    :offline="server.browserOffline"
    :pending="offline.pending"
  >
    <template v-if="list.offline" #default>
      Afvinken, het aantal, verwijderen en toevoegen kan gewoon; dat gaat naar de server zodra je
      weer verbinding hebt. Wissen kan pas weer online.
    </template>
  </OfflineNotice>

  <h1>Boodschappen</h1>

  <ShoppingListAddField v-if="list.loaded || !loading" @add="addLoose" />

  <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>

  <!-- Nog geen kopie en de server start op: dezelfde melding als op de receptenpagina. -->
  <ServerWaiting v-if="loading && !server.online && !server.offline" />

  <p v-else-if="loading" class="muted">Boodschappenlijst laden…</p>

  <p v-else-if="list.loaded && list.items.length === 0" class="empty card">
    Je boodschappenlijst is leeg. Typ hierboven wat je nodig hebt, of voeg ingrediënten toe vanaf
    een <RouterLink to="/">recept</RouterLink>.
  </p>

  <template v-else-if="list.items.length">
    <button v-if="grouped" type="button" class="ungroup" @click="setGrouped(false)">
      Groepering uit
    </button>

    <section v-for="section in sections" :key="section.key" class="section">
      <h2 v-if="section.title" :class="section.category ? 'category-title' : 'section-title'">
        {{ section.title }}
      </h2>
      <ul class="items card">
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
              @change="attempt(() => list.toggle(item.id))"
            />
            <!-- "uit: …" direct achter de regel, niet eronder: dat scheelt een regel hoogte.
                 Te lang? Dan kapt hij af met "…"; de volledige herkomst staat in de tooltip. -->
            <span class="text">
              <span class="line">{{ shoppingListLine(item) }}</span>
              <span
                v-if="shoppingListSource(item)"
                class="sources"
                :title="`uit: ${shoppingListSource(item)}`"
                >uit: {{ shoppingListSource(item) }}</span
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
      </ul>
    </section>

    <div class="actions">
      <button
        type="button"
        class="clear-checked"
        :disabled="list.offline || !list.hasChecked"
        @click="attempt(() => list.clearChecked())"
      >
        Afgevinkte wissen
      </button>
      <button type="button" class="clear-all btn-danger" :disabled="list.offline" @click="clearAll">
        Alles wissen
      </button>
    </div>

    <ShoppingListRecipes
      v-if="list.recipesOnList.length"
      :recipes="list.recipesOnList"
      :grouped="grouped"
      :offline="list.offline"
      @update:grouped="setGrouped"
      @remove="removeRecipe"
    />
  </template>

  <ConfirmDialog ref="confirmDialog" />
</template>

<style scoped>
/* Klein en rechts: alleen voor wie de groepering weer uit wil zonder te scrollen. */
.ungroup {
  display: block;
  min-height: 0;
  margin: 0 0 var(--space-2) auto;
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-sm);
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
  min-height: var(--tap);
  font-weight: 400;
  font-size: var(--text-base);
  line-height: 1.3;
  cursor: pointer;
}

.items input[type='checkbox'] {
  flex-shrink: 0;
}

/* Naam en herkomst op één regel. De naam krimpt niet (die moet je kunnen lezen); de
   herkomst krijgt wat overblijft en kapt af met "…". */
.text {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  min-width: 0;
}

.items label {
  min-width: 0;
}

/* Een lange naam loopt door over meerdere regels (ook een lang woord breekt af). */
.line {
  flex-shrink: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
}

.sources {
  min-width: 0;
  overflow: hidden;
  font-size: var(--text-xs);
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

/* Nog niet bij de server: klein en schuin, op een eigen regel onder de naam (naast de naam
   is op een telefoon geen plek: dan schuift het onder de stepper). */
.pending .text {
  flex-wrap: wrap;
  row-gap: 0;
}

.pending-mark {
  flex-basis: 100%;
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
