import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { jsonResponse } from './helpers'
import { clearMemoryStorage } from '../offline/storage'
import { saveSnapshot } from '../offline'
import { resetServerStatus } from '../stores/serverStatus'
import { mountRoute } from './mount'

const RECIPES = [{ id: 1, title: 'Pannenkoeken', tags: ['glutenvrij'], category_id: null }]
const ITEMS = [{ id: 1, name: 'melk', quantity: null, unit: null, checked: false }]
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

// Zonder verbinding, of zolang de server nog wakker wordt (ook offline, zie
// stores/serverStatus.js): alleen de offline-melding met "… is offline niet beschikbaar"; de
// pagina zelf is weg of verborgen (Recept toevoegen houdt het formulier, zie keepMounted).
function expectOfflineOnly(wrapper, name) {
  const notice = wrapper.find('.offline-notice')
  expect(notice.find('.offline-title').text()).toBe('Offline: geen verbinding met de server')
  expect(notice.find('.offline-detail').text()).toBe(`${name} is offline niet beschikbaar`)
  expect(wrapper.findAll('.offline-notice')).toHaveLength(1)
  expect(wrapper.find('.notice-error').exists()).toBe(false)
  const page = wrapper.find('.route-page')
  const hidden = !page.exists() || (page.attributes('style') ?? '').includes('display: none')
  expect(hidden).toBe(true)
  return notice
}

// De server antwoordt nog niet (geen netwerkfout): de teller zegt "wachten op verbinding".
function expectWaiting(notice) {
  expect(notice.find('.offline-counter').text()).toMatch(/^wachten op verbinding… \d+ s/)
}

// Op een pagina zonder offline data: geen kopie en geen tijd.
function expectNoCopy(notice) {
  expect(notice.text()).not.toContain('kopie')
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

  it('toont op Recepten (zonder kopie) de offline-melding en geen data zolang de server slaapt', async () => {
    const { fetch, wakeUp } = sleepingServer()
    wrapper = await mountApp('/')

    expectWaiting(expectOfflineOnly(wrapper, 'Recepten'))
    expect(wrapper.find('h1').exists()).toBe(false)
    // De receptenpagina vraagt nog niets: die opent pas als de server er is.
    expect(fetch.mock.calls.some(([url]) => url.startsWith('/api/recipes'))).toBe(false)

    wakeUp()
    await flushPromises()

    expect(wrapper.find('.offline-notice').exists()).toBe(false)
    expect(wrapper.find('h1').text()).toBe('Recepten')
    expect(wrapper.find('.recipe-card').text()).toContain('Pannenkoeken')
  })

  it.each([
    ['/standaard', 'Standaardboodschappen'],
    ['/ingredienten', 'Ingrediënten'],
  ])('toont de offline-melding ook op %s', async (path, name) => {
    sleepingServer()
    wrapper = await mountApp(path)

    expectWaiting(expectOfflineOnly(wrapper, name))
    expect(wrapper.find('h1').exists()).toBe(false)
  })

  describe('In huis', () => {
    // Alleen de gedeelde melding: geen kop, geen chips, geen voorraad-invoer.
    function expectOnlyNotice() {
      expectWaiting(expectOfflineOnly(wrapper, 'In huis'))
      expect(wrapper.find('h1').exists()).toBe(false)
      expect(wrapper.find('.filter-chip').exists()).toBe(false)
      expect(wrapper.find('input').exists()).toBe(false)
      expect(wrapper.find('.notice-error').exists()).toBe(false)
    }

    it('toont bij laden en een trage start alleen de gedeelde melding', async () => {
      const { fetch, wakeUp } = sleepingServer()
      wrapper = await mountApp('/in-huis')

      expectOnlyNotice()
      // De pagina vraagt nog niets: die opent pas als de server er is.
      expect(fetch.mock.calls.some(([url]) => url.startsWith('/api/pantry'))).toBe(false)

      wakeUp()
      await flushPromises()

      expect(wrapper.find('.offline-notice').exists()).toBe(false)
      expect(wrapper.find('h1').text()).toBe('In huis')
      expect(wrapper.find('.filter-chip').exists()).toBe(true)
      expect(wrapper.text()).toContain('Pannenkoeken')
    })

    it('toont offline alleen de gedeelde melding, en haalt op zodra er weer verbinding is', async () => {
      const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
      const fetch = vi.fn(async (url) => answer(url))
      vi.stubGlobal('fetch', fetch)
      wrapper = await mountApp('/in-huis')

      expectNoCopy(expectOfflineOnly(wrapper, 'In huis'))
      expect(wrapper.find('h1').exists()).toBe(false)
      expect(fetch.mock.calls.some(([url]) => url.startsWith('/api/pantry'))).toBe(false)

      online.mockReturnValue(true)
      window.dispatchEvent(new Event('online'))
      await flushPromises()

      expect(wrapper.find('.offline-notice').exists()).toBe(false)
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

      expectOfflineOnly(wrapper, 'In huis')
      expect(wrapper.find('.filter-chip').exists()).toBe(false)
      expect(wrapper.find('input').exists()).toBe(false)
    })

    it('toont offline met een snapshot alleen de melding met het tijdstip, geen lijst of invoer', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(new Date(2026, 10, 3, 20, 0).getTime())
      saveSnapshot(
        'app',
        { recipes: RECIPES, tags: [], categories: [], ingredients: [], pantry: PANTRY },
        new Date(2026, 10, 2, 18, 0).getTime(),
      )
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url) => answer(url)),
      )
      wrapper = await mountApp('/in-huis')

      // Ook met een snapshot: regel 2 zegt dat In huis offline niet werkt, geen tijdstip.
      expectNoCopy(expectOfflineOnly(wrapper, 'In huis'))
      expect(wrapper.find('h1').exists()).toBe(false)
      expect(wrapper.find('.filter-chip').exists()).toBe(false)
      expect(wrapper.find('input').exists()).toBe(false)
      expect(wrapper.text()).not.toContain('zout')
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
      // Wel netwerk, maar de server is weg: dezelfde offline-melding.
      expectOfflineOnly(wrapper, 'In huis')
    })
  })

  describe("pagina's zonder offline data", () => {
    it.each([
      ['/recepten/nieuw', 'Recept toevoegen'],
      ['/ingredienten', 'Ingrediënten'],
      ['/beheer', 'Beheer'],
    ])('%s toont offline alleen de melding zonder kopie', async (path, name) => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new TypeError('Failed to fetch')
        }),
      )
      wrapper = await mountApp(path)

      const notice = expectOfflineOnly(wrapper, name)
      expectNoCopy(notice)
      expect(notice.find('.offline-counter').text()).toMatch(/^geen internet op dit toestel · /)
    })

    it('Recept toevoegen houdt offline het formulier, verborgen, tot de verbinding terug is', async () => {
      const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url) => answer(url)),
      )
      wrapper = await mountApp('/recepten/nieuw')

      expectOfflineOnly(wrapper, 'Recept toevoegen')
      expect(wrapper.find('h1').exists()).toBe(true)

      online.mockReturnValue(true)
      window.dispatchEvent(new Event('online'))
      await flushPromises()

      expect(wrapper.find('.offline-notice').exists()).toBe(false)
      expect(wrapper.find('.route-page').attributes('style') ?? '').not.toContain('display: none')
    })

    it('Beheer toont geen API-fouten als de server niet te bereiken is', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new TypeError('Failed to fetch')
        }),
      )
      wrapper = await mountApp('/beheer')
      await flushPromises()

      expectNoCopy(expectOfflineOnly(wrapper, 'Beheer'))
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    })
  })

  it('verbergt Recept toevoegen achter de offline-melding, maar houdt het formulier', async () => {
    sleepingServer()
    wrapper = await mountApp('/recepten/nieuw')

    expectWaiting(expectOfflineOnly(wrapper, 'Recept toevoegen'))
    // Een half ingevuld formulier mag niet verdwijnen als de server even slaapt.
    expect(wrapper.find('h1').exists()).toBe(true)
    expect(wrapper.find('.route-page').attributes('style')).toContain('display: none')

    wakeUp()
    await flushPromises()

    expect(wrapper.find('.offline-notice').exists()).toBe(false)
    expect(wrapper.find('.route-page').attributes('style') ?? '').not.toContain('display: none')
  })

  it('toont op Boodschappen meteen de bewaarde kopie met de offline-melding zolang de server wakker wordt', async () => {
    saveSnapshot(
      'shoppingList',
      [{ ...ITEMS[0], name: 'oude melk' }],
      new Date(2026, 9, 16, 9, 41).getTime(),
    )
    const { fetch, wakeUp } = sleepingServer()
    wrapper = await mountApp('/boodschappen')

    // De server wordt wakker: dat telt als offline, dus de melding met de kopie en de teller.
    const notice = wrapper.find('.offline-notice')
    expect(notice.find('.offline-detail').text()).toMatch(/^kopie van /)
    expectWaiting(notice)
    expect(wrapper.findAll('.items .line').map((l) => l.text())).toEqual(['oude melk'])
    // Met een kopie vraagt de lijst nog niets: pas als /up antwoordt.
    expect(fetch.mock.calls.some(([url]) => url.startsWith('/api/shopping_list_items'))).toBe(false)

    wakeUp()
    await flushPromises()

    expect(wrapper.find('.offline-notice').exists()).toBe(false)
    expect(wrapper.findAll('.items .line').map((l) => l.text())).toEqual(['melk'])
  })

  it('toont op Boodschappen zonder kopie alleen de offline-melding', async () => {
    sleepingServer()
    wrapper = await mountApp('/boodschappen')

    const notice = wrapper.find('.offline-notice')
    expect(notice.find('.offline-detail').text()).toBe('Boodschappen is offline niet beschikbaar')
    expectWaiting(notice)
    expect(wrapper.text()).not.toContain('laden…')
  })
})
