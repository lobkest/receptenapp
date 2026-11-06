import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import App from '../App.vue'
import { rememberListRoute, routes } from '../router'
import { resetServerStatus } from '../stores/serverStatus'
import { serverOnlineUnlessOffline } from './helpers'

// Een pagina mounten op een route, met de echte routes uit src/router, en wachten tot de
// eerste requests (nep-fetch, zie helpers.js) klaar zijn. Geeft { wrapper, router }.
//   app: true          → heel App (menu, meldingen, servercheck) in plaats van alleen de pagina
//   attach: true       → aan document.body (nodig voor focus, zichtbaarheid en dialogen)
//   freshPinia: false  → de Pinia van de test houden (die heeft de store al gevuld)
//   beforeEach         → een router-guard, bv. requireAdmin
// Zonder App pingt niemand /up: dan doen we alsof de server meteen antwoordde (online,
// serverOnlineUnlessOffline in helpers.js). Met app: true pingt App zelf.
export async function mountRoute(
  path,
  { app = false, attach = false, freshPinia = true, beforeEach = null } = {},
) {
  if (freshPinia) setActivePinia(createPinia())
  // Met App: een ping van een vorige test (module-staat) mag deze niet beïnvloeden.
  if (app) resetServerStatus()
  else serverOnlineUnlessOffline()
  const router = createRouter({ history: createMemoryHistory(), routes })
  if (beforeEach) router.beforeEach(beforeEach)
  // Zoals de echte router: onthoud de laatste URL van recepten en In huis.
  router.afterEach(rememberListRoute)
  await router.push(path)
  const wrapper = mount(app ? App : RouterView, {
    global: { plugins: [router] },
    attachTo: attach ? document.body : undefined,
  })
  await flushPromises()
  return { wrapper, router }
}

// De knop met precies deze tekst, of undefined.
export function buttonWithText(wrapper, text) {
  return wrapper.findAll('button').find((button) => button.text() === text)
}

// De regels op de boodschappen- of standaardlijst, in schermvolgorde.
export function listLines(wrapper) {
  return wrapper.findAll('.items .line').map((line) => line.text())
}
