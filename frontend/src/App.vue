<script setup>
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { IconBook, IconHome, IconList, IconPlus, IconShoppingCart } from '@tabler/icons-vue'
import OfflineNotice from '@/components/OfflineNotice.vue'
import { NETWORK_ERROR_EVENT } from '@/api/client'
import { useLastListRouteStore } from '@/stores/lastListRoute'
import { useOfflineStore } from '@/stores/offline'
import { usePantryStore } from '@/stores/pantry'
import { useRecipesStore } from '@/stores/recipes'
import { useServerStatusStore } from '@/stores/serverStatus'
import { useShoppingListStore } from '@/stores/shoppingList'
import { useSnapshotStore } from '@/stores/snapshot'
import { useStandardItemsStore } from '@/stores/standardItems'
import { watchConnectivity } from '@/offline'

const shoppingList = useShoppingListStore()
const server = useServerStatusStore()
const pantry = usePantryStore()
const snapshot = useSnapshotStore()
const standard = useStandardItemsStore()
const offline = useOfflineStore()
const route = useRoute()
// "Recepten" en "In huis" linken naar de laatste URL van die lijst, met het filter erin
// (stores/lastListRoute.js). Actief op naam van de route, niet op de exacte URL: zo blijft
// de link gemarkeerd, ook als de query in de link en op de pagina even verschilt.
const lastList = useLastListRouteStore()
function activeOn(name) {
  return route.name === name
    ? { class: 'nav-active', 'aria-current': 'page' }
    : { class: '', 'aria-current': undefined }
}

// Het groene pilletje achter het icoon van het actieve tabblad: één element dat met een
// transform naar de goede kolom schuift (zie .nav-indicator). -1: geen tabblad actief
// (bijv. een recept of Ingrediënten); dan verdwijnt het pilletje op zijn laatste plek.
const NAV_TABS = [
  (r) => r.name === 'recipes',
  (r) => r.name === 'pantry',
  (r) => r.path === '/recepten/nieuw',
  (r) => r.path === '/boodschappen',
  (r) => r.path === '/standaard',
]
const activeTab = computed(() => NAV_TABS.findIndex((matches) => matches(route)))
let lastTab = 0
const indicatorTab = computed(() => {
  if (activeTab.value >= 0) lastTab = activeTab.value
  return lastTab
})

// De paginaovergang (Transition hieronder) speelt alleen bij een andere pagina: de key is
// het pad van de route in router/index.js ('/recepten/:id'), niet de URL. Zo blijft een
// pagina staan (en wordt hij niet opnieuw gemaakt) als alleen de query of het id wisselt,
// net als zonder overgang.
const pageKey = computed(() => route.matched.at(-1)?.path ?? route.path)

// Pagina's met meta.needsServer (router/index.js) wachten tot de server online is; tot dan
// staat er alleen de offline-melding. Met keepMounted blijft de pagina bestaan, alleen verborgen.
// Met meta.offline (recepten, standaardlijst, In huis) niet als er een offline snapshot is:
// die pagina's tonen dan meteen de kopie en verversen zodra de server antwoordt.
snapshot.restore()
// Heeft deze pagina nu de server nodig? Niet met meta.offline en een snapshot.
const needsServer = computed(
  () => Boolean(route.meta.needsServer) && !(route.meta.offline && snapshot.available),
)
// Zolang de server niet online is (ook als hij nog wakker wordt, en vlak na het starten):
// pagina's met meta.onlineOnly (In huis, Beheer) en pagina's die op de server wachten tonen
// alleen de offline-melding (hetzelfde component als op de andere pagina's), met "… is
// offline niet beschikbaar" als tweede regel en de teller eronder.
const offlineUnavailable = computed(
  () => server.offline && (needsServer.value || Boolean(route.meta.onlineOnly)),
)
const pageHidden = computed(() => offlineUnavailable.value)
const keepPage = computed(() => !pageHidden.value || Boolean(route.meta.keepMounted))

// De lijst is gedeeld: iemand anders kan hem intussen hebben aangepast. Daarom halen we
// hem op bij het starten en elke keer dat je terugschakelt naar de app (tabblad of app
// weer zichtbaar). Geen polling of websockets. Een mislukte verversing negeren we hier:
// dan blijft de oude stand staan, en de boodschappenpagina toont zelf een melding.
// Elke verversing verstuurt eerst wat offline is afgevinkt (de wachtrij in de store);
// daarom ook verversen zodra de verbinding terug is ('online').
// Ook de offline snapshot (met If-None-Match: meestal een 304) en de standaardlijst als
// die geladen is: elke load() verstuurt eerst de outbox (stores/offline.js), daarna zie je
// overal de stand van de server.
// Zolang de server niet online is, doen die load()'s met een kopie geen request (ook de
// outbox blijft dan staan); de overgang naar online (watch hieronder) ververst alles.
function refreshShoppingList() {
  shoppingList.load().catch(() => {})
  snapshot.load()
  if (standard.loaded) standard.load().catch(() => {})
}

// Bij het starten en terug naar het tabblad ook pingen of de server wakker is
// (src/stores/serverStatus.js).
function onVisibilityChange() {
  if (document.visibilityState !== 'visible') return
  server.start()
  refreshShoppingList()
  // De voorraad alleen als een pagina hem gebruikt (receptpagina, standaardlijst, In huis):
  // dan ververst ook het huisje bij terugkeren naar de app.
  if (pantry.pantry) pantry.loadPantry().catch(() => {})
}

// Een API-verzoek kwam niet aan (time-out of netwerkfout), maar de browser meldt geen
// 'offline': opnieuw pingen. Hangt de verbinding, dan is de app na PING_TIMEOUT_MS offline.
function onNetworkError() {
  if (server.online) server.check()
}

// De server is (weer) online: nu pas gaat de outbox naar de server (elke load() verstuurt
// hem eerst; stores/offline.js deelt één lopende flush, dus niets gaat dubbel), en daarna
// overal de stand van de server: de lijst, de snapshot, de standaardlijst, de voorraad en
// de recepten als die uit de kopie kwamen.
const recipes = useRecipesStore()
watch(
  () => server.online,
  (online) => {
    if (!online) return
    refreshShoppingList()
    if (pantry.pantry) pantry.loadPantry().catch(() => {})
    if (recipes.offline) {
      recipes.load()
      recipes.loadTags()
      recipes.loadCategories()
    }
  },
)

let stopWatchingConnectivity = null

onMounted(() => {
  server.start()
  refreshShoppingList()
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener(NETWORK_ERROR_EVENT, onNetworkError)
  stopWatchingConnectivity = watchConnectivity({
    onOnline: () => {
      server.start()
      refreshShoppingList()
    },
    onOffline: () => {
      server.markOffline()
      shoppingList.markOffline()
    },
  })
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener(NETWORK_ERROR_EVENT, onNetworkError)
  stopWatchingConnectivity?.()
  server.stopRetrying()
})
</script>

<template>
  <!-- Geen kopbalk met logo: op mobiel is het menu een vaste balk onderaan het scherm,
       op brede schermen een smalle rij bovenaan. -->
  <nav class="main-nav" aria-label="Hoofdmenu">
    <!-- Het schuivende pilletje (alleen mobiel); decoratief, de actieve link heeft
         aria-current. -->
    <span
      class="nav-indicator"
      :class="{ hidden: activeTab < 0 }"
      :style="{ '--tab': indicatorTab }"
      aria-hidden="true"
    ></span>
    <RouterLink :to="lastList.recipesPath" class="nav-link" v-bind="activeOn('recipes')">
      <IconBook class="nav-icon" :size="20" :stroke="1.8" aria-hidden="true" />
      <span class="nav-label">Recepten</span>
    </RouterLink>
    <RouterLink :to="lastList.pantryPath" class="nav-link" v-bind="activeOn('pantry')">
      <IconHome class="nav-icon" :size="20" :stroke="1.8" aria-hidden="true" />
      <span class="nav-label">In huis</span>
    </RouterLink>
    <RouterLink to="/recepten/nieuw" class="nav-link">
      <IconPlus class="nav-icon" :size="20" :stroke="1.8" aria-hidden="true" />
      <!-- Op mobiel alleen "Recept" (naast het plus-icoon): op een smalle telefoon past "toevoegen"
           alleen afgebroken over drie regels. Schermlezers horen het hele label. -->
      <span class="nav-label">Recept<span class="nav-wide"> toevoegen</span></span>
    </RouterLink>
    <RouterLink to="/boodschappen" class="nav-link shopping-link">
      <IconShoppingCart class="nav-icon" :size="20" :stroke="1.8" aria-hidden="true" />
      <!-- "Boodschappen (2)": het aantal nog niet afgevinkte regels, alleen als dat er zijn.
           Op mobiel staat het aantal als bolletje op het icoon (zie .nav-count), zodat
           het label op een smalle telefoon op twee regels past; de tekst blijft hetzelfde. -->
      <span class="nav-label"
        >Boodschappen<span v-if="shoppingList.openCount" class="nav-count"
          ><span class="paren"> (</span>{{ shoppingList.openCount
          }}<span class="paren">)</span></span
        ></span
      >
    </RouterLink>
    <RouterLink to="/standaard" class="nav-link">
      <IconList class="nav-icon" :size="20" :stroke="1.8" aria-hidden="true" />
      <span class="nav-label">Standaard</span>
    </RouterLink>
  </nav>
  <main>
    <!-- De server weigerde een wijziging van toen je offline was (bijv. een dubbele naam). -->
    <p v-if="offline.notice" class="notice notice-error sync-notice" role="alert">
      <span>{{ offline.notice }}</span>
      <button
        type="button"
        class="dismiss"
        aria-label="Melding sluiten"
        @click="offline.dismissNotice()"
      >
        ✕
      </button>
    </p>
    <RouterView v-slot="{ Component }">
      <OfflineNotice v-if="offlineUnavailable" :unavailable="route.meta.offlineName" />
      <!-- Een div om de pagina heen: v-show werkt niet op een pagina met meerdere
           root-elementen. display: contents, zodat hij de opmaak niet verandert. -->
      <div v-if="keepPage" v-show="!pageHidden" class="route-page">
        <!-- Een korte fade bij een andere pagina; mode="out-in": eerst de oude weg, dan de
             nieuwe, zodat ze nooit allebei in beeld staan. De div eromheen: een pagina met
             meerdere root-elementen kan zelf niet animeren. -->
        <Transition name="page" mode="out-in">
          <div :key="pageKey" class="page">
            <component :is="Component" />
          </div>
        </Transition>
      </div>
    </RouterView>
  </main>
  <!-- Ingrediënten en Beheer bewust niet in het hoofdmenu: die heb je zelden nodig.
       Ingrediënten is ook actief op een ingrediënt zelf (/ingredienten/12). -->
  <footer>
    <RouterLink to="/ingredienten">Ingrediënten</RouterLink>
    <RouterLink to="/beheer">Beheer</RouterLink>
  </footer>
</template>

<style scoped>
/* max() met env(): op een telefoon met notch (liggend) schuift de inhoud mee
   naar binnen; anders blijft de gewone marge over. */
main,
footer {
  max-width: var(--content-width);
  margin: 0 auto;
  padding-left: max(var(--space-4), env(safe-area-inset-left));
  padding-right: max(var(--space-4), env(safe-area-inset-right));
}

.route-page {
  display: contents;
}

/* Paginaovergang: kort vervagen en een paar pixels schuiven. Alleen opacity en transform;
   na de overgang staat er geen transform meer op .page. */
.page-enter-active,
.page-leave-active {
  transition:
    opacity var(--dur-fast) var(--ease-out),
    transform var(--dur-fast) var(--ease-out);
}

.page-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.page-leave-to {
  opacity: 0;
}

.sync-notice {
  display: flex;
  gap: var(--space-2);
  align-items: flex-start;
  justify-content: space-between;
}

.sync-notice .dismiss {
  flex-shrink: 0;
  min-height: 0;
  padding: 0 var(--space-2);
  background: transparent;
  border-color: transparent;
}

main {
  padding-top: var(--space-3);
  padding-bottom: var(--space-5);
}

/* ---------- Menu: mobiel (standaard) = vaste balk onderaan ---------- */

.main-nav {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10;
  display: grid;
  /* minmax(0, …): vijf gelijke kolommen, ook als een woord breder is dan zijn kolom. */
  grid-template-columns: repeat(5, minmax(0, 1fr));
  /* De balk loopt door tot de onderrand; de veilige zone (thuisbalk van de
     iPhone) blijft leeg, zodat er geen link onder je duim-gebaar zit. */
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
  box-shadow: var(--shadow-nav);
}

.nav-link {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  /* Bovenaan uitgelijnd: elk icoon op dezelfde hoogte, zodat het pilletje (op een vaste
     hoogte) er altijd achter valt, ook als het label over twee regels loopt. */
  justify-content: flex-start;
  gap: 0;
  min-height: var(--nav-height);
  padding: 3px 0 1px;
  font-size: var(--text-xs);
  font-weight: 600;
  line-height: 1.15;
  text-align: center;
  color: var(--color-text-muted);
  text-decoration: none;
  transition: color var(--dur) ease;
}

/* Het pilletje: staat vóór de links in de DOM, en de links hebben zelf position: relative,
   dus icoon en tekst liggen er vanzelf bovenop. Eén element ter breedte van een kolom, met transform naar de kolom van
   het actieve tabblad (--tab, 0 t/m 4). Het groene vlak zelf (::before) zit achter het
   icoon, gecentreerd in de kolom. */
.nav-indicator {
  position: absolute;
  top: 0;
  left: env(safe-area-inset-left);
  width: calc((100% - env(safe-area-inset-left) - env(safe-area-inset-right)) / 5);
  height: var(--nav-height);
  pointer-events: none;
  transform: translateX(calc(var(--tab) * 100%));
  transition:
    transform var(--dur) var(--ease-spring),
    opacity var(--dur-fast) ease;
}

.nav-indicator::before {
  position: absolute;
  top: 0;
  left: 50%;
  width: 52px;
  height: 26px;
  margin-left: -26px;
  content: '';
  background: var(--color-brand-soft);
  border-radius: var(--radius-full);
}

.nav-indicator.hidden {
  opacity: 0;
}

/* Het aantal boodschappen als bolletje rechtsboven het winkelwagentje. De haakjes
   blijven in de tekst (voor schermlezers), maar zijn hier onzichtbaar. */
.nav-count {
  position: absolute;
  top: 3px;
  left: calc(50% + 4px);
  min-width: 1.1rem;
  height: 1.1rem;
  padding: 0 0.25rem;
  font-size: 0.6875rem;
  line-height: 1.1rem;
  z-index: 1;
  color: var(--color-on-brand);
  background: var(--color-brand);
  border-radius: var(--radius-full);
}

.nav-count .paren {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/* Alleen op brede schermen te zien, maar altijd voorgelezen (zoals .nav-count .paren). */
.nav-wide {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/* Vijf items op een smalle telefoon: lange woorden ("Boodschappen")
   breken af met een streepje in plaats van uit de balk te lopen. */
.nav-label {
  max-width: 100%;
  overflow-wrap: anywhere;
  -webkit-hyphens: auto;
  hyphens: auto;
}

.nav-link .nav-icon {
  flex-shrink: 0;
}

/* Binnen de balk, anders valt de focusrand buiten het scherm. */
.nav-link:focus-visible {
  outline-offset: -4px;
}

/* RouterLink zet router-link-exact-active op de link van de huidige pagina; Recepten en In huis
   krijgen nav-active (zie activeOn), want hun link heeft een query. */
.nav-link.router-link-exact-active,
.nav-link.nav-active {
  color: var(--color-accent-text);
}

/* Ruimte onderaan, zodat de laatste inhoud niet achter de balk verdwijnt. */
footer {
  padding-bottom: calc(var(--nav-height) + env(safe-area-inset-bottom) + var(--space-4));
}

/* ---------- Menu: brede schermen = smalle rij bovenaan ---------- */

@media (min-width: 40rem) {
  .main-nav {
    position: static;
    display: flex;
    gap: var(--space-1);
    max-width: var(--content-width);
    margin: 0 auto;
    padding: var(--space-1) max(var(--space-4), env(safe-area-inset-right)) 0
      max(var(--space-4), env(safe-area-inset-left));
    background: none;
    border: 0;
    box-shadow: none;
  }

  .nav-link .nav-icon,
  .nav-indicator {
    display: none;
  }

  .nav-link {
    flex-direction: row;
    min-height: var(--tap);
    padding: var(--space-1) var(--space-3);
    font-size: var(--text-base);
    color: var(--color-text-muted);
    border-radius: var(--radius-full);
    transition:
      color var(--dur) ease,
      background-color var(--dur) var(--ease-out);
  }

  .nav-link:hover {
    color: var(--color-text);
    background: var(--color-surface-hover);
  }

  /* Breed: hetzelfde groene pilletje, maar dan achter de hele link. De links zijn hier
     niet even breed, dus het schuift niet mee maar vervaagt naar de nieuwe link. */
  .nav-link.router-link-exact-active,
  .nav-link.nav-active {
    background: var(--color-brand-soft);
  }

  footer {
    padding-bottom: var(--space-5);
  }

  /* Breed: gewoon "Boodschappen (2)" in de tekst. */
  .nav-count {
    position: static;
    min-width: 0;
    height: auto;
    padding: 0;
    font-size: inherit;
    line-height: inherit;
    color: inherit;
    background: none;
  }

  .nav-wide,
  .nav-count .paren {
    position: static;
    width: auto;
    height: auto;
    clip-path: none;
  }
}

/* ---------- Footer ---------- */

footer {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
  padding-top: var(--space-2);
  border-top: 1px solid var(--color-border);
  font-size: var(--text-sm);
}

footer a {
  display: inline-flex;
  align-items: center;
  min-height: var(--tap);
  color: var(--color-text-muted);
}

/* Op de ingrediëntenpagina's (ook /ingredienten/12) zie je waar je bent. */
footer a.router-link-active {
  color: var(--color-accent-text);
  font-weight: 600;
}
</style>
