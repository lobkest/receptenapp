import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { rememberListRoute, routes } from '../router'
import { useLastListRouteStore } from '../stores/lastListRoute'
import { jsonResponse, mockFetch } from './helpers'
import { mountRoute } from './mount'

// De terugknop op de receptpagina en de menulinks "Recepten" en "In huis" gaan naar de
// laatste URL van die lijst, met het filter erin (stores/lastListRoute.js).

const SOUP = { id: 5, title: 'Tomatensoep', description: 'Lekker.', servings: 4 }

// Alleen de route-namen tellen voor de store; de pagina's zelf worden niet gemount.
function makeRouter() {
  const router = createRouter({ history: createMemoryHistory(), routes })
  router.afterEach(rememberListRoute)
  return router
}

describe('lastListRoute-store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('zonder bezochte lijst: terug naar het receptenoverzicht, menu zonder query', () => {
    const store = useLastListRouteStore()

    expect(store.back).toEqual({ to: { name: 'recipes' }, label: '← Recepten' })
    expect(store.recipesPath).toBe('/')
    expect(store.pantryPath).toBe('/in-huis')
  })

  it('onthoudt per lijst de URL met filter, ook na router.replace', async () => {
    const router = makeRouter()
    await router.push('/?tags=snel')
    await router.replace('/?tags=snel&category=3')
    await router.push('/recepten/5')
    const store = useLastListRouteStore()

    expect(store.recipesPath).toBe('/?tags=snel&category=3')
    expect(store.back).toEqual({ to: '/?tags=snel&category=3', label: '← Recepten' })
  })

  it('kiest de laatst bezochte lijst; de andere houdt haar eigen URL', async () => {
    const router = makeRouter()
    await router.push('/?tags=snel')
    await router.push('/in-huis?tags=vegetarisch')
    await router.push('/recepten/5')
    const store = useLastListRouteStore()

    expect(store.back).toEqual({ to: '/in-huis?tags=vegetarisch', label: '← In huis' })
    expect(store.recipesPath).toBe('/?tags=snel')
  })

  it('andere pagina’s veranderen niets', async () => {
    const router = makeRouter()
    await router.push('/in-huis')
    await router.push('/boodschappen')
    await router.push('/recepten/5')

    expect(useLastListRouteStore().last).toBe('pantry')
  })
})

describe('terugknop op de receptpagina', () => {
  beforeEach(() => {
    // Het recept, de rest leeg; de offline snapshot (met app: true) is er niet.
    mockFetch((method, url) => {
      if (url === '/api/recipes/5') return jsonResponse(SOUP)
      if (url.startsWith('/api/offline_snapshot')) return jsonResponse({ error: 'nee' }, 404)
      return jsonResponse([])
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('zonder opgeslagen lijst (directe link): "← Recepten" naar het overzicht', async () => {
    const { wrapper, router } = await mountRoute('/recepten/5')
    const back = wrapper.find('a.back-top')

    expect(back.text()).toBe('← Recepten')
    expect(back.attributes('href')).toBe('/')
    await back.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('recipes')
  })

  it('met opgeslagen In huis-filter: "← In huis" terug naar dat filter', async () => {
    setActivePinia(createPinia())
    useLastListRouteStore().remember({ name: 'pantry', fullPath: '/in-huis?tags=snel' })
    const { wrapper, router } = await mountRoute('/recepten/5', { freshPinia: false })
    const back = wrapper.find('a.back-top')

    expect(back.text()).toBe('← In huis')
    await back.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/in-huis?tags=snel')
  })

  it('menu: Recepten linkt naar het opgeslagen filter en blijft actief met query', async () => {
    const { wrapper, router } = await mountRoute('/?tags=snel', { app: true })
    const link = wrapper.find('nav a.nav-link')

    expect(link.attributes('href')).toBe('/?tags=snel')
    expect(link.classes()).toContain('nav-active')
    expect(link.attributes('aria-current')).toBe('page')
    await router.push('/recepten/5')
    await flushPromises()
    expect(wrapper.find('nav a.nav-link').classes()).not.toContain('nav-active')
  })
})
