import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import { routes } from '../router'
import { jsonResponse, mockFetch } from './helpers'

const RECIPES = [
  { id: 1, title: 'Pannenkoeken', servings: 4, tags: ['vega', 'zoet'] },
  { id: 2, title: 'Tosti', servings: 1, tags: ['snel'] },
  { id: 3, title: 'Groentesoep', servings: 4, tags: ['snel', 'vega'] },
]
const TAGS = [
  { name: 'snel', count: 2 },
  { name: 'vega', count: 2 },
  { name: 'zoet', count: 1 },
]

// Een nep-server zoals Rails: /api/recipes?tags=a,b geeft de recepten met ALLE tags.
function fakeApi({ recipes = RECIPES, tags = TAGS } = {}) {
  return mockFetch((method, url) => {
    const [path, query = ''] = url.split('?')
    if (path === '/api/tags') return jsonResponse(tags)
    if (path === '/api/recipes') {
      const wanted = new URLSearchParams(query).get('tags')?.split(',').filter(Boolean) ?? []
      return jsonResponse(recipes.filter((r) => wanted.every((tag) => r.tags.includes(tag))))
    }
    throw new Error(`Onverwachte request: ${method} ${url}`)
  })
}

// Een echte router in het geheugen: het filter staat in de URL-query.
async function mountAt(path = '/') {
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push(path)
  const wrapper = mount(RouterView, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

function titles(wrapper) {
  return wrapper.findAll('.recipe-grid h2').map((h) => h.text())
}

function chip(wrapper, name) {
  return wrapper.findAll('.filter-chip').find((c) => c.text().startsWith(name))
}

function recipeUrls(fetch) {
  return fetch.mock.calls.map(([url]) => url).filter((url) => url.startsWith('/api/recipes'))
}

describe('RecipeListView', () => {
  beforeEach(() => {
    // Elke test een verse store, zodat er geen lijst uit een vorige test blijft hangen.
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('toont een laadtekst zolang de API nog niet geantwoord heeft', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )
    const { wrapper } = await mountAt()

    expect(wrapper.text()).toContain('Recepten laden…')
  })

  it('toont een foutmelding als de server niet bereikbaar is', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const { wrapper } = await mountAt()

    expect(wrapper.text()).toContain('Kan de server niet bereiken.')
    expect(wrapper.find('.notice button').text()).toBe('Opnieuw proberen')
    // Zonder tags geen filterrij.
    expect(wrapper.find('.filter').exists()).toBe(false)
  })

  it('toont een foutmelding bij een serverfout', async () => {
    mockFetch(() => jsonResponse({}, 500))
    const { wrapper } = await mountAt()

    expect(wrapper.text()).toContain('Er ging iets mis op de server.')
  })

  it('toont een lege-staat-tekst als er nog geen recepten zijn', async () => {
    fakeApi({ recipes: [], tags: [] })
    const { wrapper } = await mountAt()

    expect(wrapper.text()).toContain('Er zijn nog geen recepten.')
    expect(wrapper.find('.recipe-grid').exists()).toBe(false)
  })

  it('toont de recepten met titel, porties, tags en link', async () => {
    const fetch = fakeApi()
    const { wrapper } = await mountAt()

    const cards = wrapper.findAll('.recipe-grid > li')
    expect(cards).toHaveLength(3)
    expect(cards[0].text()).toContain('Pannenkoeken')
    expect(cards[0].text()).toContain('4 porties')
    expect(cards[0].findAll('.tag').map((t) => t.text())).toEqual(['vega', 'zoet'])
    expect(cards[1].text()).toContain('1 portie')
    expect(cards[0].find('a').attributes('href')).toBe('/recepten/1')
    expect(recipeUrls(fetch)).toEqual(['/api/recipes'])
  })

  describe('filteren op tags', () => {
    it('toont alle tags als chips met aantal, geen enkele ingedrukt', async () => {
      fakeApi()
      const { wrapper } = await mountAt()

      const chips = wrapper.findAll('.filter-chip')
      expect(chips.map((c) => c.text())).toEqual(['snel 2', 'vega 2', 'zoet 1'])
      expect(chips.map((c) => c.attributes('aria-pressed'))).toEqual(['false', 'false', 'false'])
      expect(wrapper.find('.chip-row').attributes('aria-label')).toBe('Filter op tag')
      expect(wrapper.find('.clear-filters').exists()).toBe(false)
    })

    it('zet een filter aan: in de URL, ingedrukt, en de lijst wordt opnieuw geladen', async () => {
      const fetch = fakeApi()
      const { wrapper, router } = await mountAt()

      await chip(wrapper, 'vega').trigger('click')
      await flushPromises()

      expect(router.currentRoute.value.query.tags).toBe('vega')
      expect(chip(wrapper, 'vega').attributes('aria-pressed')).toBe('true')
      expect(recipeUrls(fetch).at(-1)).toBe('/api/recipes?tags=vega')
      expect(titles(wrapper)).toEqual(['Pannenkoeken', 'Groentesoep'])
    })

    it('combineert filters (AND) en zet ze ook weer uit', async () => {
      const fetch = fakeApi()
      const { wrapper, router } = await mountAt()

      await chip(wrapper, 'vega').trigger('click')
      await flushPromises()
      await chip(wrapper, 'snel').trigger('click')
      await flushPromises()

      expect(router.currentRoute.value.query.tags).toBe('vega,snel')
      expect(recipeUrls(fetch).at(-1)).toBe('/api/recipes?tags=vega,snel')
      expect(titles(wrapper)).toEqual(['Groentesoep'])

      await chip(wrapper, 'vega').trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.query.tags).toBe('snel')
      expect(titles(wrapper)).toEqual(['Tosti', 'Groentesoep'])
    })

    it('leest het filter uit de URL, bijv. na terug-navigatie', async () => {
      const fetch = fakeApi()
      const { wrapper } = await mountAt('/?tags=snel')

      expect(recipeUrls(fetch)).toEqual(['/api/recipes?tags=snel'])
      expect(chip(wrapper, 'snel').attributes('aria-pressed')).toBe('true')
      expect(titles(wrapper)).toEqual(['Tosti', 'Groentesoep'])
    })

    it('behoudt het filter als je naar een recept gaat en terug', async () => {
      fakeApi()
      const { wrapper, router } = await mountAt('/')
      await chip(wrapper, 'zoet').trigger('click')
      await flushPromises()

      await router.push('/recepten/1')
      router.back()
      await flushPromises()
      // memory history: back() is asynchroon; wacht tot de route terug is.
      await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/'))
      await flushPromises()

      expect(router.currentRoute.value.query.tags).toBe('zoet')
      expect(chip(wrapper, 'zoet').attributes('aria-pressed')).toBe('true')
      expect(titles(wrapper)).toEqual(['Pannenkoeken'])
    })

    it('wist alle filters met "Wis filters"', async () => {
      fakeApi()
      const { wrapper, router } = await mountAt('/?tags=vega,snel')

      await wrapper.find('.clear-filters').trigger('click')
      await flushPromises()

      expect(router.currentRoute.value.query.tags).toBeUndefined()
      expect(wrapper.find('.clear-filters').exists()).toBe(false)
      expect(titles(wrapper)).toHaveLength(3)
    })

    it('meldt duidelijk dat er niets gevonden is', async () => {
      fakeApi()
      const { wrapper } = await mountAt('/?tags=zoet,snel')

      expect(wrapper.find('.no-results').text()).toBe('Geen recepten met zoet + snel')
      expect(wrapper.text()).not.toContain('Er zijn nog geen recepten.')
      expect(wrapper.find('.clear-filters').exists()).toBe(true)
    })

    it('toont een gekozen tag die niet (meer) bestaat, zodat je hem uit kunt zetten', async () => {
      fakeApi()
      const { wrapper, router } = await mountAt('/?tags=bestaat-niet')

      const unknown = chip(wrapper, 'bestaat-niet')
      expect(unknown.text()).toBe('bestaat-niet')
      expect(unknown.attributes('aria-pressed')).toBe('true')

      await unknown.trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.query.tags).toBeUndefined()
    })

    it('gebruikt alleen het antwoord op het laatste filter', async () => {
      // Het antwoord op "vega" komt pas binnen nadat "snel" al geladen is.
      let releaseVega
      mockFetch((method, url) => {
        if (url === '/api/tags') return jsonResponse(TAGS)
        if (url === '/api/recipes?tags=vega') {
          return new Promise((resolve) => (releaseVega = () => resolve(jsonResponse([RECIPES[0]]))))
        }
        return jsonResponse(url.endsWith('snel') ? [RECIPES[1]] : RECIPES)
      })
      const { wrapper, router } = await mountAt('/')

      await router.replace('/?tags=vega')
      await router.replace('/?tags=snel')
      await flushPromises()
      releaseVega()
      await flushPromises()

      expect(titles(wrapper)).toEqual(['Tosti'])
    })
  })
})
