import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { clearMemoryStorage, writeJson } from '../offline/storage'
import { jsonResponse, mockFetch } from './helpers'
import { mountRoute } from './mount'

// De receptpagina met een offline snapshot: eerst de kopie, daarna de verse versie van de
// server (stale-while-revalidate), en offline alleen de kopie.
const SOUP = {
  id: 5,
  title: 'Tomatensoep',
  description: null,
  servings: 4,
  tags: [],
  automatic_tags: [],
  ingredients: [
    { id: 1, ingredient_id: 10, name: 'tomaat', quantity: 400, unit: 'g', optional: false },
  ],
  steps: [],
  variations: [],
}

function saveSnapshot(recipe, savedAt = Date.now()) {
  return writeJson('app:snapshot', {
    savedAt,
    etag: 'W/"x"',
    data: {
      recipes: [recipe],
      tags: [],
      categories: [],
      ingredients: [],
      standard_items: [],
      pantry: null,
    },
  })
}

function deferred() {
  let resolve
  const promise = new Promise((r) => (resolve = r))
  return { promise, resolve }
}

describe('receptpagina uit de offline snapshot', () => {
  beforeEach(() => {
    localStorage.clear()
    clearMemoryStorage()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('toont meteen de kopie; porties die je kiest voordat de server antwoordt, blijven staan', async () => {
    await saveSnapshot(SOUP)
    const fresh = deferred()
    mockFetch((method, url) =>
      url === '/api/recipes/5' ? fresh.promise : jsonResponse(url.includes('offline') ? {} : []),
    )
    const { wrapper } = await mountRoute('/recepten/5')

    expect(wrapper.find('h1').text()).toBe('Tomatensoep')
    await wrapper.find('[aria-label="Meer porties"]').trigger('click')
    expect(wrapper.find('.servings-count').text()).toBe('5 porties')

    fresh.resolve(jsonResponse({ ...SOUP, title: 'Tomatensoep (vers)' }))
    await flushPromises()

    expect(wrapper.find('h1').text()).toBe('Tomatensoep (vers)')
    expect(wrapper.find('.servings-count').text()).toBe('5 porties')
    wrapper.unmount()
  })

  it('offline: geen request voor het recept, en bewerken staat uit', async () => {
    await saveSnapshot(SOUP)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const fetch = mockFetch(() => jsonResponse([]))
    const { wrapper } = await mountRoute('/recepten/5')

    expect(wrapper.find('h1').text()).toBe('Tomatensoep')
    expect(fetch.mock.calls.some(([url]) => url === '/api/recipes/5')).toBe(false)
    expect(wrapper.find('.recipe-actions .edit').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.recipe-actions .offline-hint').text()).toBe(
      'Niet beschikbaar zonder verbinding',
    )
    wrapper.unmount()
  })

  // Het recept komt uit de snapshot, "op lijst" uit de boodschappenlijst: de melding
  // toont het oudste van die twee tijdstippen.
  it.each([
    ['het recept', new Date(2026, 10, 2, 18, 0), new Date(2026, 10, 3, 8, 0), 'gisteren 18:00'],
    ['de lijst', new Date(2026, 10, 3, 8, 0), new Date(2026, 10, 1, 10, 0), '2 dagen geleden'],
  ])('offline: bovenaan de melding met het oudste tijdstip (%s)', async (_, app, list, text) => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date(2026, 10, 3, 20, 0).getTime())
    await saveSnapshot(SOUP, app.getTime())
    await writeJson('shoppingList:snapshot', { savedAt: list.getTime(), data: [] })
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    mockFetch(() => jsonResponse([]))
    const { wrapper } = await mountRoute('/recepten/5')
    await flushPromises()

    const notice = wrapper.find('.offline-notice')
    expect(notice.find('strong').text()).toBe(`Offline kopie van ${text}`)
    expect(notice.find('.sync-state').exists()).toBe(false)
    // Als eerste op de pagina, boven de titel.
    expect(wrapper.element.querySelector('.offline-notice, h1').className).toContain(
      'offline-notice',
    )
    wrapper.unmount()
  })
})
