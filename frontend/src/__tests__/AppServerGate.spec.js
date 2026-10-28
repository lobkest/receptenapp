import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { jsonResponse } from './helpers'
import { clearMemoryStorage } from '../offline/storage'
import { saveSnapshot } from '../offline'
import { resetServerStatus } from '../stores/serverStatus'
import { mountRoute } from './mount'

const RECIPES = [{ id: 1, title: 'Pannenkoeken', tags: ['glutenvrij'], category_id: null }]
const ITEMS = [{ id: 1, name: 'melk', quantity: null, unit: null, checked: false }]
const WAKING = 'Server wordt wakker, ophalen… (kan ~1 minuut duren)'
const OFFLINE = 'Offline. Zodra er weer verbinding is, wordt alles opgehaald.'
const PANTRY = { in_house: [], staples: [{ id: 1, name: 'zout', present: true }], suggestions: [] }
const PANTRY_RECIPES = [0, 1, 2].map((count) => ({
  missing_count: count,
  recipes: count === 1 ? [{ ...RECIPES[0], servings: 2, category: null, missing: [] }] : [],
}))

// Antwoorden van een wakkere server, voor de nep-fetch hieronder.
function answer(url) {
  if (url === '/up') return new Response('', { status: 200 })
  if (url.startsWith('/api/recipes')) return jsonResponse(RECIPES)
  if (url === '/api/tags') return jsonResponse([{ name: 'glutenvrij', count: 1, automatic: true }])
  if (url === '/api/categories') return jsonResponse([])
  if (url === '/api/shopping_list_items') return jsonResponse(ITEMS)
  if (url === '/api/pantry') return jsonResponse(PANTRY)
  if (url.startsWith('/api/pantry/recipes')) return jsonResponse(PANTRY_RECIPES)
  return jsonResponse({}, 404)
}

// Van de slapende server van de huidige test: na elke test wakker, zodat er geen
// hangende verzoeken (zoals een lopende load() van de boodschappenlijst) overblijven.
let wakeUp = () => {}

// Een server die slaapt: /up (en de lijst) antwoorden pas na wakeUp().
function sleepingServer() {
  const awake = new Promise((resolve) => (wakeUp = resolve))
  const fetch = vi.fn(async (url) => {
    await awake
    return answer(url)
  })
  vi.stubGlobal('fetch', fetch)
  return { fetch, wakeUp }
}

async function mountApp(path) {
  const { wrapper } = await mountRoute(path, { app: true })
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
    vi.restoreAllMocks()
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

  describe('In huis', () => {
    // Alleen de gedeelde melding: geen kop, geen chips, geen voorraad-invoer.
    function expectOnlyNotice(text) {
      expect(wrapper.find('.server-waiting').text()).toBe(text)
      expect(wrapper.find('h1').exists()).toBe(false)
      expect(wrapper.find('.filter-chip').exists()).toBe(false)
      expect(wrapper.find('input').exists()).toBe(false)
      expect(wrapper.find('.notice-error').exists()).toBe(false)
    }

    it('toont bij laden en een trage start alleen de gedeelde melding', async () => {
      const { fetch, wakeUp } = sleepingServer()
      wrapper = await mountApp('/in-huis')

      expectOnlyNotice(WAKING)
      // De pagina vraagt nog niets: die opent pas als de server er is.
      expect(fetch.mock.calls.some(([url]) => url.startsWith('/api/pantry'))).toBe(false)

      wakeUp()
      await flushPromises()

      expect(wrapper.find('.server-waiting').exists()).toBe(false)
      expect(wrapper.find('h1').text()).toBe('In huis')
      expect(wrapper.find('.filter-chip').exists()).toBe(true)
      expect(wrapper.text()).toContain('Pannenkoeken')
    })

    it('toont offline alleen de gedeelde melding, en haalt op zodra er weer verbinding is', async () => {
      const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
      const fetch = vi.fn(async (url) => answer(url))
      vi.stubGlobal('fetch', fetch)
      wrapper = await mountApp('/in-huis')

      expectOnlyNotice(OFFLINE)
      expect(wrapper.find('.server-waiting .spinner').exists()).toBe(false)
      expect(fetch.mock.calls.some(([url]) => url.startsWith('/api/pantry'))).toBe(false)

      online.mockReturnValue(true)
      window.dispatchEvent(new Event('online'))
      await flushPromises()

      expect(wrapper.find('.server-waiting').exists()).toBe(false)
      expect(fetch.mock.calls.some(([url]) => url === '/api/pantry')).toBe(true)
      expect(wrapper.find('h1').text()).toBe('In huis')
      expect(wrapper.text()).toContain('Pannenkoeken')
    })

    it('gaat terug naar de gedeelde melding als de verbinding wegvalt', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url) => answer(url)),
      )
      wrapper = await mountApp('/in-huis')
      expect(wrapper.find('h1').text()).toBe('In huis')

      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
      window.dispatchEvent(new Event('offline'))
      await flushPromises()

      expectOnlyNotice(OFFLINE)
    })

    it('laat bij een mislukte voorraad de serverstatus opnieuw kijken, zonder eigen foutblok', async () => {
      let serverUp = true
      const fetch = vi.fn(async (url) => {
        if (!serverUp) throw new TypeError('Failed to fetch')
        if (url === '/api/pantry') {
          serverUp = false
          throw new TypeError('Failed to fetch')
        }
        return answer(url)
      })
      vi.stubGlobal('fetch', fetch)
      wrapper = await mountApp('/in-huis')

      // De nieuwe ping naar /up mislukt ook: de gedeelde melding neemt het over.
      expect(fetch.mock.calls.filter(([url]) => url === '/up')).toHaveLength(2)
      expectOnlyNotice('Server niet bereikbaar, opnieuw proberen…')
    })
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
    expect(wrapper.find('.offline-notice').text()).toMatch(
      /^Offline kopie van 16 okt( 2026)? om 09:41, bijwerken…/,
    )
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
