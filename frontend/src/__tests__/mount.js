import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import App from '../App.vue'
import { routes } from '../router'

// Een pagina mounten op een route, met de echte routes uit src/router, en wachten tot de
// eerste requests (nep-fetch, zie helpers.js) klaar zijn. Geeft { wrapper, router }.
//   app: true          → heel App (menu, meldingen, servercheck) in plaats van alleen de pagina
//   attach: true       → aan document.body (nodig voor focus, zichtbaarheid en dialogen)
//   freshPinia: false  → de Pinia van de test houden (die heeft de store al gevuld)
//   beforeEach         → een router-guard, bv. requireAdmin
export async function mountRoute(
  path,
  { app = false, attach = false, freshPinia = true, beforeEach = null } = {},
) {
  if (freshPinia) setActivePinia(createPinia())
  const router = createRouter({ history: createMemoryHistory(), routes })
  if (beforeEach) router.beforeEach(beforeEach)
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
