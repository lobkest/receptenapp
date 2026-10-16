import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import { routes } from '../router'
import { jsonResponse, mockFetch } from './helpers'

// Ingrediënt wisselen op de receptpagina: chips, de wissel in de URL, en "op lijst".
const WOK = {
  id: 7,
  title: 'Wok',
  description: null,
  servings: 2,
  steps: [],
  ingredients: [
    {
      id: 12,
      name: 'kip',
      quantity: 250,
      unit: 'g',
      optional: false,
      alternatives: [
        { id: 3, name: 'tofu', quantity: null, unit: null, effective_quantity: 250, effective_unit: 'g' },
        { id: 4, name: 'tempeh', quantity: 200, unit: 'g', effective_quantity: 200, effective_unit: 'g' },
      ],
    },
    { id: 13, name: 'rijst', quantity: 150, unit: 'g', optional: false, alternatives: [] },
  ],
  variations: [
    { id: 30, name: 'Pittig', notes: null, position: 1, lock_version: 0, changes: [], tag_changes: [] },
  ],
}

let requests

async function mountAt(path) {
  requests = []
  mockFetch((method, url, options) => {
    if (method === 'POST') {
      requests.push({ url, body: JSON.parse(options.body) })
      return jsonResponse([], 201)
    }
    if (url === '/api/recipes/7') return jsonResponse(structuredClone(WOK))
    return jsonResponse([])
  })
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push(path)
  const wrapper = mount(RouterView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router }
}

function lines(wrapper) {
  return wrapper.findAll('.ingredients .line').map((l) => l.text())
}

function chips(wrapper) {
  return wrapper.findAll('.ingredients .chip').map((c) => c.text())
}

function button(wrapper, label) {
  return wrapper.find(`button[aria-label="${label}"]`)
}

function buttonWithText(wrapper, text) {
  return wrapper.findAll('button').find((b) => b.text().startsWith(text))
}

describe('ingrediënt wisselen op de receptpagina', () => {
  beforeEach(() => sessionStorage.clear())

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('toont chips onder een ingrediënt met alternatieven, en geen bij de rest', async () => {
    const { wrapper } = await mountAt('/recepten/7')

    expect(lines(wrapper)).toEqual(['250 g kip', '150 g rijst'])
    expect(chips(wrapper)).toEqual(['⇄ tofu', '⇄ tempeh'])
    expect(wrapper.findAll('.ingredients .alternatives')).toHaveLength(1)
  })

  it('wisselen zet het alternatief in de regel, "↺ kip" terug, en staat in de URL (replace)', async () => {
    const { wrapper, router } = await mountAt('/recepten/7?porties=x')
    const replace = vi.spyOn(router, 'replace')
    const push = vi.spyOn(router, 'push')

    await button(wrapper, 'Wissel voor tempeh').trigger('click')
    await flushPromises()

    expect(lines(wrapper)).toEqual(['200 g tempeh', '150 g rijst'])
    expect(chips(wrapper)).toEqual(['↺ kip', '⇄ tofu'])
    // Andere query-parameters blijven staan.
    expect(router.currentRoute.value.query).toEqual({ porties: 'x', wissel: '12:4' })
    expect(replace).toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()

    await button(wrapper, 'Wissel voor tofu').trigger('click')
    await flushPromises()
    expect(lines(wrapper)[0]).toBe('250 g tofu')
    expect(router.currentRoute.value.query.wissel).toBe('12:3')

    await button(wrapper, 'Terug naar kip').trigger('click')
    await flushPromises()
    expect(lines(wrapper)[0]).toBe('250 g kip')
    expect(router.currentRoute.value.query).toEqual({ porties: 'x' })
  })

  it('een link met ?wissel= laat de wissel meteen zien (herladen), en schaalt mee', async () => {
    const { wrapper } = await mountAt('/recepten/7?wissel=12:3')

    expect(lines(wrapper)[0]).toBe('250 g tofu')
    await button(wrapper, 'Meer porties').trigger('click')
    expect(lines(wrapper)[0]).toBe('375 g tofu')
  })

  it('ongeldige of verouderde ids in de URL worden genegeerd, zonder fout', async () => {
    const { wrapper } = await mountAt('/recepten/7?wissel=12:99,13:3,abc')

    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(lines(wrapper)).toEqual(['250 g kip', '150 g rijst'])
    expect(chips(wrapper)).toEqual(['⇄ tofu', '⇄ tempeh'])
  })

  it('"Alles op lijst", "+ lijst" en "Variatie op lijst" sturen de gewisselde alternatieven mee', async () => {
    const { wrapper } = await mountAt('/recepten/7?wissel=12:4')

    await buttonWithText(wrapper, 'Alles op lijst').trigger('click')
    await flushPromises()
    await button(wrapper, 'tempeh op boodschappenlijst').trigger('click')
    await flushPromises()
    await buttonWithText(wrapper, 'Variatie op lijst').trigger('click')
    await flushPromises()

    expect(requests).toEqual([
      { url: '/api/recipes/7/add_to_shopping_list', body: { servings: 2, alternative_ids: [4] } },
      {
        url: '/api/recipes/7/add_to_shopping_list',
        body: { servings: 2, ingredient_ids: [12], alternative_ids: [4] },
      },
      {
        url: '/api/recipes/7/variations/30/add_to_shopping_list',
        body: { servings: 2, alternative_ids: [4] },
      },
    ])
    expect(wrapper.find('.variations [role="status"]').text()).toContain('Pittig')
  })

  it('zonder wissel gaat er geen alternative_ids mee', async () => {
    const { wrapper } = await mountAt('/recepten/7')

    await buttonWithText(wrapper, 'Alles op lijst').trigger('click')
    await flushPromises()

    expect(requests).toEqual([{ url: '/api/recipes/7/add_to_shopping_list', body: { servings: 2 } }])
  })
})
