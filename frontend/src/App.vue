<script setup>
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import ServerWaiting from '@/components/ServerWaiting.vue'
import { useServerStatusStore } from '@/stores/serverStatus'
import { useShoppingListStore } from '@/stores/shoppingList'
import { watchConnectivity } from '@/offline'

const shoppingList = useShoppingListStore()
const server = useServerStatusStore()
const route = useRoute()

// Pagina's met meta.needsServer (router/index.js) wachten tot de server online is; tot dan
// staat er een laadmelding. Met keepMounted blijft de pagina bestaan, alleen verborgen.
const waitingForServer = computed(() => Boolean(route.meta.needsServer) && !server.online)
const keepPage = computed(() => !waitingForServer.value || Boolean(route.meta.keepMounted))

// De lijst is gedeeld: iemand anders kan hem intussen hebben aangepast. Daarom halen we
// hem op bij het starten en elke keer dat je terugschakelt naar de app (tabblad of app
// weer zichtbaar). Geen polling of websockets. Een mislukte verversing negeren we hier:
// dan blijft de oude stand staan, en de boodschappenpagina toont zelf een melding.
// Elke verversing verstuurt eerst wat offline is afgevinkt (de wachtrij in de store);
// daarom ook verversen zodra de verbinding terug is ('online').
function refreshShoppingList() {
  shoppingList.load().catch(() => {})
}

// Bij het starten en terug naar het tabblad ook pingen of de server wakker is
// (src/stores/serverStatus.js).
function onVisibilityChange() {
  if (document.visibilityState !== 'visible') return
  server.start()
  refreshShoppingList()
}

// Is de server (weer) online en is de lijst nog niet vers, haal hem dan nu op.
watch(
  () => server.online,
  (online) => {
    if (online && !shoppingList.fresh) refreshShoppingList()
  },
)

let stopWatchingConnectivity = null

onMounted(() => {
  server.start()
  refreshShoppingList()
  document.addEventListener('visibilitychange', onVisibilityChange)
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
  stopWatchingConnectivity?.()
  server.stopRetrying()
})
</script>

<template>
  <!-- Geen kopbalk met logo: op mobiel is het menu een vaste balk onderaan het scherm,
       op brede schermen een smalle rij bovenaan. -->
  <nav class="main-nav" aria-label="Hoofdmenu">
    <RouterLink to="/" class="nav-link">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Z" />
        <path d="M4 21a2 2 0 0 1 2-2h13v2H6" />
      </svg>
      <span class="nav-label">Recepten</span>
    </RouterLink>
    <RouterLink to="/in-huis" class="nav-link">
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
    <RouterView v-slot="{ Component }">
      <ServerWaiting v-if="waitingForServer" />
      <!-- Een div om de pagina heen: v-show werkt niet op een pagina met meerdere
           root-elementen. display: contents, zodat hij de opmaak niet verandert. -->
      <div v-if="keepPage" v-show="!waitingForServer" class="route-page">
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

/* RouterLink zet deze class op de link van de huidige pagina. */
.nav-link.router-link-exact-active {
  color: var(--color-accent-text);
}

.nav-link.router-link-exact-active::before {
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

  .nav-link.router-link-exact-active::before {
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
