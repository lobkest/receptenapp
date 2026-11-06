<script setup>
import { computed, onMounted, onUnmounted, useTemplateRef, watch } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
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

// De strook achter de statusbalk (#status-bar-backdrop in index.html, buiten #app) krijgt
// een lijntje zodra je gescrold bent. Een IntersectionObserver op een onzichtbaar
// element helemaal bovenaan de pagina (.scroll-sentinel) in plaats van een scroll-listener:
// de browser meldt alleen als het in of uit beeld gaat, niet bij elke scrollstap. Ook na
// een routewissel klopt het vanzelf: staat de nieuwe pagina bovenaan, dan is de sentinel
// weer in beeld en gaat de klasse eraf.
const scrollSentinel = useTemplateRef('scrollSentinel')
let sentinelObserver = null

function watchScrolled() {
  const backdrop = document.getElementById('status-bar-backdrop')
  if (!backdrop || !scrollSentinel.value || typeof IntersectionObserver === 'undefined') return
  sentinelObserver = new IntersectionObserver(([entry]) => {
    backdrop.classList.toggle('is-scrolled', !entry.isIntersecting)
  })
  sentinelObserver.observe(scrollSentinel.value)
}

onMounted(() => {
  watchScrolled()
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
  sentinelObserver?.disconnect()
  server.stopRetrying()
})
</script>

<template>
  <!-- Onzichtbaar, helemaal bovenaan de pagina: uit beeld = gescrold (zie watchScrolled). -->
  <div ref="scrollSentinel" class="scroll-sentinel" aria-hidden="true"></div>
  <!-- Geen kopbalk met logo: op mobiel is het menu een vaste balk onderaan het scherm,
       op brede schermen een smalle rij bovenaan. -->
  <nav class="main-nav" aria-label="Hoofdmenu">
    <RouterLink :to="lastList.recipesPath" class="nav-link" v-bind="activeOn('recipes')">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Z" />
        <path d="M4 21a2 2 0 0 1 2-2h13v2H6" />
      </svg>
      <span class="nav-label">Recepten</span>
    </RouterLink>
    <RouterLink :to="lastList.pantryPath" class="nav-link" v-bind="activeOn('pantry')">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M3 11 12 4l9 7" />
        <path d="M5 10v10h14V10" />
        <path d="M10 20v-5h4v5" />
      </svg>
      <span class="nav-label">In huis</span>
    </RouterLink>
    <RouterLink to="/recepten/nieuw" class="nav-link">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 5v14M5 12h14" />
      </svg>
      <!-- Op mobiel alleen "Recept" (naast het plus-icoon): op een smalle telefoon past "toevoegen"
           alleen afgebroken over drie regels. Schermlezers horen het hele label. -->
      <span class="nav-label">Recept<span class="nav-wide"> toevoegen</span></span>
    </RouterLink>
    <RouterLink to="/boodschappen" class="nav-link shopping-link">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M3 4h2l2.4 11h10.2L20 7H6.2" />
        <circle cx="9" cy="19.5" r="1.5" />
        <circle cx="17" cy="19.5" r="1.5" />
      </svg>
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
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M9 6h11M9 12h11M9 18h11" />
        <path d="M4 6h.01M4 12h.01M4 18h.01" />
      </svg>
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
        <component :is="Component" />
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
/* Absoluut, zodat hij geen ruimte inneemt en niet meeschuift met meldingen of de
   padding van #app: altijd de eerste pixel van het document. */
.scroll-sentinel {
  position: absolute;
  top: 0;
  left: 0;
  width: 1px;
  height: 1px;
  pointer-events: none;
}

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
  justify-content: center;
  gap: 0;
  min-height: var(--nav-height);
  padding: 1px 0;
  font-size: var(--text-xs);
  font-weight: 600;
  line-height: 1.15;
  text-align: center;
  color: var(--color-text-muted);
  text-decoration: none;
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

.nav-link svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
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

.nav-link.router-link-exact-active::before,
.nav-link.nav-active::before {
  content: '';
  position: absolute;
  top: 0;
  left: 25%;
  right: 25%;
  height: 3px;
  background: var(--color-brand);
  border-radius: 0 0 var(--radius-full) var(--radius-full);
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

  .nav-link svg {
    display: none;
  }

  .nav-link {
    flex-direction: row;
    min-height: var(--tap);
    padding: var(--space-1) var(--space-3);
    font-size: var(--text-base);
    color: var(--color-text);
    border-radius: var(--radius-sm);
  }

  .nav-link:hover {
    background: var(--color-surface-hover);
  }

  .nav-link.router-link-exact-active::before,
  .nav-link.nav-active::before {
    top: auto;
    bottom: 0;
    left: var(--space-3);
    right: var(--space-3);
    border-radius: var(--radius-full) var(--radius-full) 0 0;
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
