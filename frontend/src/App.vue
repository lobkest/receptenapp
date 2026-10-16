<script setup>
import { computed, onMounted, onUnmounted } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { useShoppingListStore } from '@/stores/shoppingList'
import { watchConnectivity } from '@/offline'

const shoppingList = useShoppingListStore()

// De lijst is gedeeld: iemand anders kan hem intussen hebben aangepast. Daarom halen we
// hem op bij het starten en elke keer dat je terugschakelt naar de app (tabblad of app
// weer zichtbaar). Geen polling of websockets. Een mislukte verversing negeren we hier:
// dan blijft de oude stand staan, en de boodschappenpagina toont zelf een melding.
// Elke verversing verstuurt eerst wat offline is afgevinkt (de wachtrij in de store);
// daarom ook verversen zodra de verbinding terug is ('online').
function refreshShoppingList() {
  shoppingList.load().catch(() => {})
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') refreshShoppingList()
}

let stopWatchingConnectivity = null

onMounted(() => {
  refreshShoppingList()
  document.addEventListener('visibilitychange', onVisibilityChange)
  stopWatchingConnectivity = watchConnectivity({
    onOnline: refreshShoppingList,
    onOffline: () => shoppingList.markOffline(),
  })
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
  stopWatchingConnectivity?.()
})

// "Boodschappen (2)": het aantal nog niet afgevinkte regels, alleen als dat er zijn.
const shoppingLabel = computed(() =>
  shoppingList.openCount ? `Boodschappen (${shoppingList.openCount})` : 'Boodschappen',
)
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
    <RouterLink to="/recepten/nieuw" class="nav-link">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 5v14M5 12h14" />
      </svg>
      <span class="nav-label">Recept toevoegen</span>
    </RouterLink>
    <RouterLink to="/boodschappen" class="nav-link shopping-link">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M3 4h2l2.4 11h10.2L20 7H6.2" />
        <circle cx="9" cy="19.5" r="1.5" />
        <circle cx="17" cy="19.5" r="1.5" />
      </svg>
      <span class="nav-label">{{ shoppingLabel }}</span>
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
    <RouterView />
  </main>
  <!-- Beheer bewust niet in het hoofdmenu: bezoekers hebben er niets te zoeken. -->
  <footer>
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
  grid-template-columns: repeat(4, 1fr);
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
  padding: 1px var(--space-1);
  font-size: var(--text-xs);
  font-weight: 600;
  line-height: 1.15;
  text-align: center;
  color: var(--color-text-muted);
  text-decoration: none;
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
}

/* ---------- Footer ---------- */

footer {
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
</style>
