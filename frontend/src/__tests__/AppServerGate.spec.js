import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import App from '../App.vue'
import { routes } from '../router'
import { jsonResponse } from './helpers'
import { clearMemoryStorage } from '../offline/storage'
import { saveSnapshot } from '../offline'
import { resetServerStatus } from '../stores/serverStatus'

const RECIPES = [{ id: 1, title: 'Pannenkoeken', tags: ['glutenvrij'], category_id: null }]
const ITEMS = [{ id: 1, name: 'melk', quantity: null, unit: null, checked: false }]
const WAKING = 'Server wordt wakker, ophalen… (kan ~1 minuut duren)'

// Van de slapende server van de huidige test: na elke test wakker, zodat er geen
// hangende verzoeken (zoals een lopende load() van de boodschappenlijst) overblijven.
let wakeUp = () => {}

// Een server die slaapt: /up (en de lijst) antwoorden pas na wakeUp().
function sleepingServer() {
  const awake = new Promise((resolve) => (wakeUp = resolve))
  const fetch = vi.fn(async (url) => {
    if (url === '/up') {
      await awake
      return new Response('', { status: 200 })
    }
    await awake
    if (url.startsWith('/api/recipes')) return jsonResponse(RECIPES)
    if (url === '/api/tags')
      return jsonResponse([{ name: 'glutenvrij', count: 1, automatic: true }])
    if (url === '/api/categories') return jsonResponse([])
    if (url === '/api/shopping_list_items') return jsonResponse(ITEMS)
    return jsonResponse({}, 404)
  })
  vi.stubGlobal('fetch', fetch)
  return { fetch, wakeUp }
}

async function mountApp(path) {
  setActivePinia(createPinia())
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push(path)
  const wrapper = mount(App, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

describe('App: wachten op de server', () => {
  let wrapper

  beforeEach(() => {
    localStorage.clear()
    clearMemoryStorage()
    resetServerStatus()
  })

  afterEach(async () => {
    wakeUp()
    await flushPromises()
    wrapper?.unmount()
    resetServerStatus()
    vi.unstubAllGlobals()
  })

  it('toont op Recepten een laadmelding en geen data zolang de server slaapt', async () => {
    const { fetch, wakeUp } = sleepingServer()
    wrapper = await mountApp('/')

    expect(wrapper.find('.server-waiting').text()).toBe(WAKING)
    expect(wrapper.find('h1').exists()).toBe(false)
    // De receptenpagina vraagt nog niets: die opent pas als de server er is.
    expect(fetch.mock.calls.some(([url]) => url.startsWith('/api/recipes'))).toBe(false)

    wakeUp()
    await flushPromises()

    expect(wrapper.find('.server-waiting').exists()).toBe(false)
    expect(wrapper.find('h1').text()).toBe('Recepten')
    expect(wrapper.find('.recipe-card').text()).toContain('Pannenkoeken')
  })

  it.each([['/standaard'], ['/ingredienten']])('toont de laadmelding ook op %s', async (path) => {
    sleepingServer()
    wrapper = await mountApp(path)

    expect(wrapper.find('.server-waiting').text()).toBe(WAKING)
    expect(wrapper.find('h1').exists()).toBe(false)
  })

  it('verbergt Recept toevoegen achter de laadmelding, maar houdt het formulier', async () => {
    sleepingServer()
    wrapper = await mountApp('/recepten/nieuw')

    expect(wrapper.find('.server-waiting').text()).toBe(WAKING)
    // Een half ingevuld formulier mag niet verdwijnen als de server even slaapt.
    expect(wrapper.find('h1').exists()).toBe(true)
    expect(wrapper.find('.route-page').attributes('style')).toContain('display: none')

    wakeUp()
    await flushPromises()

    expect(wrapper.find('.server-waiting').exists()).toBe(false)
    expect(wrapper.find('.route-page').attributes('style') ?? '').not.toContain('display: none')
  })

  it('toont op Boodschappen meteen de offline kopie, met "bijwerken…", tot de verse lijst er is', async () => {
    saveSnapshot(
      'shoppingList',
      [{ ...ITEMS[0], name: 'oude melk' }],
      new Date(2026, 9, 16, 9, 41).getTime(),
    )
    const { wakeUp } = sleepingServer()
    wrapper = await mountApp('/boodschappen')

    expect(wrapper.find('.server-waiting').exists()).toBe(false)
    expect(wrapper.find('.offline-notice').text()).toMatch(/^Offline kopie van 09:41, bijwerken…/)
    expect(wrapper.findAll('.items .line').map((l) => l.text())).toEqual(['oude melk'])

    wakeUp()
    await flushPromises()

    expect(wrapper.find('.offline-notice').exists()).toBe(false)
    expect(wrapper.findAll('.items .line').map((l) => l.text())).toEqual(['melk'])
  })

  it('toont op Boodschappen zonder kopie de laadmelding', async () => {
    sleepingServer()
    wrapper = await mountApp('/boodschappen')

    expect(wrapper.find('.server-waiting').text()).toBe(WAKING)
  })
})
