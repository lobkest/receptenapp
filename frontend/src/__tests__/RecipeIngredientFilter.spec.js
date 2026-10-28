import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import RecipeCard from '../components/RecipeCard.vue'
import { jsonResponse, mockFetch } from './helpers'
import { mountRoute } from './mount'

// "Met ingrediënt…" op het receptenoverzicht.

const INGREDIENTS = [
  { id: 11, name: 'aubergine' },
  { id: 12, name: 'courgette' },
  { id: 13, name: 'courgettebloem' },
  { id: 14, name: 'feta' },
]
const LUNCH = { id: 1, name: 'Lunch', position: 1 }
const DINER = { id: 2, name: 'Diner', position: 2 }

const match = (fields) => ({ missing: [], missing_count: 0, ...fields })
const found = (id, name, via = 'original', swap = null) => ({ ingredient_id: id, name, via, swap })

const RECIPES = [
  { id: 1, title: 'Ratatouille', servings: 4, tags: ['vega'], category: DINER },
  { id: 2, title: 'Moussaka', servings: 6, tags: [], category: DINER },
  { id: 3, title: 'Courgettesoep', servings: 2, tags: ['snel'], category: LUNCH },
]

// Wat de server bij ?ingredient_ids=12 geeft, al in zijn volgorde (best passend eerst).
const FOUND = [
  {
    ...RECIPES[2],
    ingredient_match: match({ matches: [found(12, 'courgette')] }),
  },
  {
    ...RECIPES[0],
    ingredient_match: match({
      matches: [found(12, 'courgette', 'optional')],
      missing: [{ id: 21, name: 'paprika' }],
      missing_count: 1,
    }),
  },
  {
    ...RECIPES[1],
    ingredient_match: match({
      matches: [
        found(12, 'courgette', 'alternative', {
          recipe_ingredient_id: 31,
          alternative_id: 7,
          ingredient: 'aubergine',
          alternative: 'courgette',
        }),
      ],
      missing: [
        { id: 32, name: 'gehakt' },
        { id: 33, name: 'feta' },
      ],
      missing_count: 2,
    }),
  },
]

function fakeApi({ found = FOUND } = {}) {
  return mockFetch((method, url) => {
    const [path, query = ''] = url.split('?')
    const params = new URLSearchParams(query)
    if (path === '/api/tags') return jsonResponse([])
    if (path === '/api/categories') return jsonResponse([LUNCH, DINER])
    if (path === '/api/ingredients') return jsonResponse(INGREDIENTS)
    if (path === '/api/recipes') {
      const tags = params.get('tags')?.split(',') ?? []
      const list = params.get('ingredient_ids') ? found : RECIPES
      return jsonResponse(list.filter((r) => tags.every((tag) => r.tags.includes(tag))))
    }
    if (method === 'POST' && path.endsWith('/add_to_shopping_list')) return jsonResponse([], 201)
    throw new Error(`Onverwachte request: ${method} ${url}`)
  })
}

async function mountAt(path = '/') {
  return mountRoute(path, { freshPinia: false })
}

const titles = (wrapper) => wrapper.findAll('.recipe-grid h3').map((h) => h.text())
const recipeUrls = (fetch) =>
  fetch.mock.calls.map(([url]) => url).filter((url) => url.startsWith('/api/recipes'))

describe('Met ingrediënt… op het receptenoverzicht', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => vi.unstubAllGlobals())

  it('zoekt een ingrediënt, kiest het als chip met × en zet het in de URL', async () => {
    const fetch = fakeApi()
    const { wrapper, router } = await mountAt()

    await wrapper.find('input[aria-label="Met ingrediënt"]').setValue('courg')
    const options = wrapper.findAll('[aria-label="Gevonden ingrediënten"] button')
    expect(options.map((b) => b.text())).toEqual(['+ courgette', '+ courgettebloem'])

    await options[0].trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.query.met).toBe('12')
    expect(recipeUrls(fetch).at(-1)).toBe('/api/recipes?ingredient_ids=12')
    expect(wrapper.find('input[aria-label="Met ingrediënt"]').element.value).toBe('')
    expect(wrapper.find('[aria-label="Gekozen ingrediënten"]').text()).toContain('courgette')

    // Een gekozen ingrediënt staat niet meer bij de gevonden.
    await wrapper.find('input[aria-label="Met ingrediënt"]').setValue('courg')
    expect(
      wrapper.findAll('[aria-label="Gevonden ingrediënten"] button').map((b) => b.text()),
    ).toEqual(['+ courgettebloem'])
  })

  it('Enter kiest het eerste gevonden ingrediënt', async () => {
    fakeApi()
    const { wrapper, router } = await mountAt('/?met=12')

    const input = wrapper.find('input[aria-label="Met ingrediënt"]')
    await input.setValue('fet')
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()

    expect(router.currentRoute.value.query.met).toBe('12,14')
  })

  it('toont een platte lijst in de volgorde van de server, zonder categoriesecties', async () => {
    fakeApi()
    const { wrapper } = await mountAt('/?met=12')

    expect(titles(wrapper)).toEqual(['Courgettesoep', 'Ratatouille', 'Moussaka'])
    expect(wrapper.find('.category-section').exists()).toBe(false)
    expect(wrapper.find('#found-title').text()).toBe('Met courgette')
  })

  it('zonder ingrediënt weer de secties per categorie', async () => {
    fakeApi()
    const { wrapper, router } = await mountAt('/?met=12')

    await wrapper.find('[aria-label="courgette weghalen"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.query.met).toBeUndefined()
    expect(wrapper.findAll('.category-section h2').map((h) => h.text())).toEqual(['Lunch', 'Diner'])
  })

  it('categorie- en tag-chips filteren mee, de volgorde blijft die van de server', async () => {
    const fetch = fakeApi()
    const { wrapper } = await mountAt('/?met=12&category=2')

    expect(titles(wrapper)).toEqual(['Ratatouille', 'Moussaka'])

    await mountAt('/?met=12&tags=vega')
    expect(recipeUrls(fetch).at(-1)).toBe('/api/recipes?tags=vega&ingredient_ids=12')
  })

  it('toont op de kaart wat je nog moet kopen en de hint, en opent met de wissel', async () => {
    fakeApi()
    const { wrapper } = await mountAt('/?met=12')

    const cards = wrapper.findAll('.recipe-card')
    expect(cards[0].find('.to-buy').text()).toBe('nog kopen: 0')
    expect(cards[0].find('.match-hint').exists()).toBe(false)
    expect(cards[1].find('.match-hint').text()).toBe('courgette optioneel')
    expect(cards[2].find('.match-hint').text()).toBe('met courgette i.p.v. aubergine')
    expect(cards[2].find('.to-buy').text()).toBe('nog kopen: 2 (gehakt, feta)')

    expect(cards[0].find('a').attributes('href')).toBe('/recepten/3')
    expect(cards[2].find('a').attributes('href')).toBe('/recepten/2?wissel=31:7')
  })

  it('"Ontbrekende op lijst" zet alleen de ontbrekende regels op de lijst', async () => {
    const fetch = fakeApi()
    const { wrapper } = await mountAt('/?met=12')

    const cards = wrapper.findAll('.recipe-card')
    expect(cards[0].find('.add-missing').exists()).toBe(false)
    await cards[2].find('.add-missing').trigger('click')
    await flushPromises()

    const call = fetch.mock.calls.find(([url]) => url.endsWith('/add_to_shopping_list'))
    expect(call[0]).toBe('/api/recipes/2/add_to_shopping_list')
    expect(JSON.parse(call[1].body)).toEqual({ servings: 6, ingredient_ids: [32, 33] })
    expect(cards[2].text()).toContain('Op de lijst ✓')
    // De knop staat niet in de link: tikken opent het recept niet.
    expect(cards[2].find('a .add-missing').exists()).toBe(false)
  })

  it('lege staat noemt de gekozen ingrediënten', async () => {
    fakeApi({ found: [] })
    const { wrapper } = await mountAt('/?met=12,11')

    expect(wrapper.find('.no-results').text()).toBe('Geen recepten met courgette of aubergine')
  })

  it('"Wis filters" wist ook de ingrediënten', async () => {
    fakeApi()
    const { wrapper, router } = await mountAt('/?met=12')

    await wrapper.find('.clear-filters').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.query).toEqual({})
  })
})

describe('RecipeCard zonder ingredient_match', () => {
  it('is gewoon één link, zonder "nog kopen"', () => {
    const wrapper = mount(RecipeCard, {
      props: { recipe: { id: 7, title: 'Pannenkoeken', servings: 4 } },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })

    expect(wrapper.findComponent(RouterLinkStub).props('to')).toBe('/recepten/7')
    expect(wrapper.find('.to-buy').exists()).toBe(false)
    expect(wrapper.find('button').exists()).toBe(false)
  })
})
