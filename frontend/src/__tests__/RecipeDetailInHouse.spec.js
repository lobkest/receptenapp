import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { jsonResponse, mockFetch } from './helpers'
import { mountRoute } from './mount'

// "In huis" op de receptpagina: het huisje per ingrediënt, aan/uit tikken, overslaan bij
// "Alles op lijst" en "Variatie op lijst", en de wissel-hint.

const WOK = {
  id: 7,
  title: 'Wok',
  description: null,
  servings: 2,
  steps: [],
  ingredients: [
    {
      id: 12,
      ingredient_id: 1,
      name: 'kip',
      quantity: 250,
      unit: 'g',
      optional: false,
      alternatives: [
        { id: 3, ingredient_id: 4, name: 'tofu', effective_quantity: 250, effective_unit: 'g' },
        { id: 4, ingredient_id: 5, name: 'tempeh', effective_quantity: 200, effective_unit: 'g' },
      ],
    },
    { id: 13, ingredient_id: 2, name: 'rijst', quantity: 150, unit: 'g', optional: false },
    { id: 14, ingredient_id: 3, name: 'zout', quantity: null, unit: null, optional: false },
    { id: 15, ingredient_id: 6, name: 'koriander', quantity: 5, unit: 'g', optional: true },
  ].map((row) => ({ alternatives: [], ...row })),
  variations: [
    {
      id: 30,
      name: 'Met feta',
      notes: null,
      position: 1,
      lock_version: 0,
      changes: [
        { id: 40, kind: 'remove', recipe_ingredient_id: 14, name: 'zout' },
        { id: 41, kind: 'add', name: 'feta', quantity: 50, unit: 'g' },
        { id: 42, kind: 'add', name: 'spek', quantity: 50, unit: 'g' },
      ],
      tag_changes: [],
    },
  ],
}

const INGREDIENTS = [
  [1, 'kip'],
  [2, 'rijst'],
  [3, 'zout'],
  [4, 'tofu'],
  [5, 'tempeh'],
  [6, 'koriander'],
  [7, 'feta'],
].map(([id, name]) => ({ id, name }))

let requests
let present

// De voorraad zoals /api/pantry: zout is basis (aan), de rest staat in present.
function pantry() {
  return {
    in_house: INGREDIENTS.filter((i) => i.id !== 3 && present.has(i.id)),
    staples: [{ id: 3, name: 'zout', present: present.has(3) }],
    suggestions: [],
  }
}

async function mountAt(path) {
  requests = []
  present = new Set([2, 3, 4, 5, 7])
  mockFetch((method, url, options) => {
    const body = options.body ? JSON.parse(options.body) : null
    if (method !== 'GET') requests.push({ method, url, body })
    const toggle = url.match(/^\/api\/pantry\/ingredients\/(\d+)$/)
    if (toggle) {
      const id = Number(toggle[1])
      if (body.pantry_item.present) present.add(id)
      else present.delete(id)
      return jsonResponse(pantry())
    }
    if (url === '/api/pantry') return jsonResponse(pantry())
    if (url === '/api/ingredients') return jsonResponse(INGREDIENTS)
    if (url === '/api/recipes/7') return jsonResponse(structuredClone(WOK))
    if (url.endsWith('/add_to_shopping_list')) {
      // Eén regel per ingrediënt dat niet overgeslagen is (zoals de server).
      const skipped = body.skip_ingredient_ids ?? []
      const rows = body.ingredient_ids
        ? WOK.ingredients.filter((row) => body.ingredient_ids.includes(row.id))
        : WOK.ingredients.filter((row) => !row.optional && !skipped.includes(row.id))
      return jsonResponse(
        rows.map((row, index) => ({ id: 100 + index, name: row.name, checked: false })),
        201,
      )
    }
    return jsonResponse([])
  })
  return mountRoute(path)
}

function row(wrapper, id) {
  return wrapper.find(`.ingredients > ul > li[data-id="${id}"]`)
}

function house(wrapper, id) {
  return row(wrapper, id).find('.house-button')
}

describe('In huis op de receptpagina', () => {
  let wrapper

  beforeEach(() => localStorage.clear())
  afterEach(() => {
    wrapper?.unmount()
    vi.unstubAllGlobals()
  })

  it('toont "in huis" (ook basisvoorraad) of een leeg huisje, naast de lijstknop', async () => {
    ;({ wrapper } = await mountAt('/recepten/7'))

    expect(house(wrapper, 13).text()).toBe('in huis')
    expect(house(wrapper, 13).classes()).toContain('in-house')
    expect(house(wrapper, 14).text()).toBe('in huis')
    expect(house(wrapper, 12).text()).toBe('')
    expect(house(wrapper, 12).classes()).not.toContain('in-house')
    expect(house(wrapper, 12).attributes('aria-label')).toBe(
      'kip is niet in huis; tik om in de voorraad te zetten',
    )
    expect(row(wrapper, 13).find('.row-buttons .list-button').exists()).toBe(true)
  })

  it('een tik zet het uit de voorraad en weer terug', async () => {
    ;({ wrapper } = await mountAt('/recepten/7'))

    await house(wrapper, 13).trigger('click')
    await flushPromises()
    expect(house(wrapper, 13).text()).toBe('')
    await house(wrapper, 13).trigger('click')
    await flushPromises()
    expect(house(wrapper, 13).text()).toBe('in huis')

    // Ook basisvoorraad mag uit.
    await house(wrapper, 14).trigger('click')
    await flushPromises()
    expect(house(wrapper, 14).text()).toBe('')

    expect(requests.map((r) => [r.url, r.body.pantry_item.present])).toEqual([
      ['/api/pantry/ingredients/2', false],
      ['/api/pantry/ingredients/2', true],
      ['/api/pantry/ingredients/3', false],
    ])
  })

  it('"Alles op lijst" slaat in-huis over en meldt hoeveel; optioneel blijft eraf', async () => {
    ;({ wrapper } = await mountAt('/recepten/7'))

    await wrapper.find('.add-all').trigger('click')
    await flushPromises()

    expect(requests).toEqual([
      {
        method: 'POST',
        url: '/api/recipes/7/add_to_shopping_list',
        body: { servings: 2, skip_ingredient_ids: [13, 14] },
      },
    ])
    expect(wrapper.find('.added').text()).toBe('1 toegevoegd, 2 al in huis.')
  })

  it('"+ lijst" voegt toe, ook als het in huis is', async () => {
    ;({ wrapper } = await mountAt('/recepten/7'))

    await row(wrapper, 13).find('.list-button').trigger('click')
    await flushPromises()

    expect(requests[0].body).toEqual({ servings: 2, ingredient_ids: [13] })
  })

  it('hint "tofu in huis → wissel (+1)"; een tik wisselt, ook in de URL', async () => {
    let router
    ;({ wrapper, router } = await mountAt('/recepten/7'))

    expect(row(wrapper, 12).find('.house-hint').text()).toBe('tofu in huis → wissel (+1)')
    expect(row(wrapper, 13).find('.house-hint').exists()).toBe(false)

    await row(wrapper, 12).find('.house-hint').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.query.wissel).toBe('12:3')
    expect(row(wrapper, 12).find('.line').text()).toBe('250 g tofu')
    expect(house(wrapper, 12).text()).toBe('in huis')
    expect(row(wrapper, 12).find('.house-hint').exists()).toBe(false)
  })

  it('"Variatie op lijst" slaat in-huis-regels en -toevoegingen over', async () => {
    ;({ wrapper } = await mountAt('/recepten/7'))
    // feta (toevoeging, op naam) is in huis; spek is geen bestaand ingrediënt: geen huisje.
    const additions = wrapper.findAll('.variation-card .change.added')
    expect(additions.map((a) => a.find('.house-button').exists())).toEqual([true, false])
    expect(additions[0].find('.house-button').text()).toBe('in huis')

    await wrapper.find('.variation-card .add-to-list').trigger('click')
    await flushPromises()

    // rijst (13) in huis; zout (14) laat de variatie zelf al weg, koriander is optioneel.
    expect(requests[0]).toEqual({
      method: 'POST',
      url: '/api/recipes/7/variations/30/add_to_shopping_list',
      body: { servings: 2, skip_ingredient_ids: [13], skip_addition_ids: [41] },
    })
    expect(wrapper.find('.variations .notice-success').text()).toMatch(
      /^"Met feta": .* al in huis\.$/,
    )
  })
})
