<script setup>
import { computed, onMounted, ref, useTemplateRef, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import OfflineNotice from '@/components/OfflineNotice.vue'
import ServerWaiting from '@/components/ServerWaiting.vue'
import ShoppingListRecipes from '@/components/ShoppingListRecipes.vue'
import { useServerStatusStore } from '@/stores/serverStatus'
import { useShoppingListStore } from '@/stores/shoppingList'
import { shoppingListLine, shoppingListSource } from '@/utils/shoppingListLine'
import { categorySections, groupByRecipe, removeRecipeQuestion } from '@/utils/shoppingListRecipes'

// De lijst staat op de server (via de store), gedeeld met iedereen die de link heeft.
// Bij openen van deze pagina halen we hem opnieuw op; bij terugschakelen naar de app
// of als de verbinding terugkomt doet App.vue dat. Offline toont de store de laatst
// opgeslagen kopie; dan kun je alleen afvinken.
// Bij openen staat de offline kopie er meteen, met "Offline kopie van 14:05, bijwerken…"
// erboven; zodra de verse lijst binnen is (list.fresh), verdwijnt die melding.
const list = useShoppingListStore()
const server = useServerStatusStore()

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
  <h1>Boodschappen</h1>

  <OfflineNotice
    v-if="list.loaded && (!list.fresh || list.offline || list.pending > 0)"
    :saved-at="list.savedAt"
    :offline="server.browserOffline"
    :pending="list.pending"
  >
    <template v-if="list.offline" #default>
      Afvinken kan gewoon; dat gaat naar de server zodra je weer verbinding hebt. Verwijderen en
      wissen kan pas weer online.
    </template>
  </OfflineNotice>

  <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>

  <!-- Nog geen kopie om te tonen: dezelfde melding als op de receptenpagina. -->
  <ServerWaiting v-if="loading && !server.online" />

  <p v-else-if="loading" class="muted">Boodschappenlijst laden…</p>

  <p v-else-if="list.loaded && list.items.length === 0" class="empty card">
    Je boodschappenlijst is leeg. Voeg ingrediënten toe vanaf een
    <RouterLink to="/">recept</RouterLink>.
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
          :class="{ checked: item.checked }"
        >
          <label>
            <input
              type="checkbox"
              :checked="item.checked"
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
            </span>
          </label>
          <div class="line-actions">
            <!-- Alleen bij iets van de standaardlijst: één minder ("melk ×2" → "melk"). -->
            <button
              v-if="item.standard_count > 0"
              type="button"
              class="minus"
              :disabled="list.offline"
              :aria-label="`Eén ${item.name} minder`"
              @click="attempt(() => list.removeStandard(item.id))"
            >
              −
            </button>
            <button
              type="button"
              class="remove"
              :disabled="list.offline"
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
  column-gap: var(--space-2);
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

.line {
  flex-shrink: 0;
  max-width: 100%;
}

.sources {
  min-width: 0;
  overflow: hidden;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.line-actions {
  display: flex;
}

.remove,
.minus {
  color: var(--color-text-muted);
  background: transparent;
  border-color: transparent;
}

/* − is een tikje groter en donkerder dan ✕: dit gebruik je vaker. */
.minus {
  width: var(--tap);
  padding: 0;
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--color-accent-text);
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
