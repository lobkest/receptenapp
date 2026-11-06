import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { requireAdmin } from '../router'
import { resetServerStatus, useServerStatusStore } from '../stores/serverStatus'
import { goOffline, jsonResponse, mockFetch } from './helpers'
import { mountRoute } from './mount'

// Recept bewerken, Ingrediënt bewerken en Beheer > versies zonder verbinding: dezelfde
// offline-melding bovenaan als elke pagina, het formulier (of de lijst) blijft staan met wat
// je invulde, en opslaan staat uit tot de verbinding terug is.

const RECIPE = {
  id: 6,
  title: 'Pannenkoeken',
  description: 'Dun.',
  servings: 4,
  lock_version: 3,
  tags: [],
  ingredients: [{ id: 21, name: 'bloem', quantity: 250, unit: 'g', optional: false }],
  steps: [{ id: 11, position: 1, body: 'Beslag maken.' }],
}

const INGREDIENT = {
  id: 2,
  name: 'ei',
  lock_version: 3,
  needs_review: true,
  nevo_food: null,
  grams_per_piece: 50,
  grams_per_ml: null,
  label: { kcal: null, protein: null, carbohydrates: null, fat: null, fiber: null },
  units: ['stuks'],
  traits: [],
  traits_checked: false,
  staple: false,
}

const VERSIONS = {
  recipe: { id: 6, title: 'Pannenkoeken', deletion_requested_at: null },
  versions: [
    { id: 13, created_at: '2026-10-15T10:00:00Z', summary: 'Gewijzigd: titel', current: true },
    { id: 12, created_at: '2026-10-14T10:00:00Z', summary: 'Eerste versie', current: false },
  ],
}

// Antwoordt per URL; een schrijfactie (PATCH/POST) geeft het gevraagde terug.
function fakeApi() {
  return mockFetch((method, url, options) => {
    const body = options.body ? JSON.parse(options.body) : {}
    if (url === '/api/recipes/6') {
      return jsonResponse(method === 'PATCH' ? { ...RECIPE, ...body.recipe } : RECIPE)
    }
    if (url === '/api/ingredients/2') {
      return jsonResponse(method === 'PATCH' ? { ...INGREDIENT, ...body.ingredient } : INGREDIENT)
    }
    if (url === '/api/traits') return jsonResponse([{ name: 'dierlijk', excluded_by: [] }])
    if (url === '/api/admin/recipes/6/versions') return jsonResponse(VERSIONS)
    return jsonResponse([])
  })
}

function writes(fetch) {
  return fetch.mock.calls.filter(
    ([url, options]) => options.method && options.method !== 'GET' && url !== '/up',
  )
}

function notice(wrapper) {
  return wrapper.find('.offline-notice')
}

describe("bewerkpagina's offline", () => {
  let wrapper

  beforeEach(() => {
    sessionStorage.clear()
    resetServerStatus()
  })

  afterEach(() => {
    wrapper?.unmount()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('Recept bewerken: melding, ingevulde titel blijft, opslaan uit (ook met Enter)', async () => {
    const fetch = fakeApi()
    ;({ wrapper } = await mountRoute('/recepten/6/bewerken'))
    expect(notice(wrapper).exists()).toBe(false)
    await wrapper.find('#title').setValue('Dunne pannenkoeken')

    await goOffline()

    expect(notice(wrapper).text()).toContain('Offline: geen verbinding met de server')
    expect(wrapper.find('#title').element.value).toBe('Dunne pannenkoeken')
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.offline-hint').exists()).toBe(true)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(writes(fetch)).toEqual([])
  })

  it('Recept bewerken: met verbinding terug kan opslaan weer', async () => {
    const fetch = fakeApi()
    ;({ wrapper } = await mountRoute('/recepten/6/bewerken'))
    await wrapper.find('#title').setValue('Dunne pannenkoeken')
    await goOffline()

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    await useServerStatusStore().start()
    await flushPromises()

    expect(notice(wrapper).exists()).toBe(false)
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined()
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(writes(fetch).map(([url, options]) => [url, options.method])).toEqual([
      ['/api/recipes/6', 'PATCH'],
    ])
  })

  it('Ingrediënt bewerken: melding, ingevuld veld blijft, opslaan, Klopt en vinkjes uit', async () => {
    const fetch = fakeApi()
    ;({ wrapper } = await mountRoute('/ingredienten/2'))
    await wrapper.find('#grams-per-piece').setValue('55')

    await goOffline()

    expect(notice(wrapper).text()).toContain('Offline: geen verbinding met de server')
    expect(wrapper.find('#grams-per-piece').element.value).toBe('55')
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.review button').attributes('disabled')).toBeDefined()
    expect(wrapper.find('#staple').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.trait-option input').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.start-merge').attributes('disabled')).toBeDefined()
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(writes(fetch)).toEqual([])
  })

  it('Beheer > versies: melding, versies blijven staan, terugzetten uit', async () => {
    sessionStorage.setItem('adminCode', 'geheim')
    const fetch = fakeApi()
    ;({ wrapper } = await mountRoute('/beheer/recepten/6/versies', {
      attach: true,
      beforeEach: requireAdmin,
    }))

    await goOffline()

    expect(notice(wrapper).text()).toContain('Offline: geen verbinding met de server')
    expect(wrapper.findAll('.versions li')).toHaveLength(2)
    expect(wrapper.find('.restore').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.offline-hint').exists()).toBe(true)
    expect(writes(fetch)).toEqual([])
  })
})
