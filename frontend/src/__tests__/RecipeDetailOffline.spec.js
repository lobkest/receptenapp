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

function saveSnapshot(recipe) {
  return writeJson('app:snapshot', {
    savedAt: Date.now(),
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
})
