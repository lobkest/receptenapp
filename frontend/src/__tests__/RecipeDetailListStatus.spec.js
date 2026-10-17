import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import { routes } from '../router'
import { fakeServer, jsonResponse, mockFetch } from './helpers'

// Op de receptpagina: "+ lijst", "✓ op lijst" of "✓ via …" per ingrediënt, afgeleid uit
// de boodschappenlijst (de store), niet uit eigen state van de knop.

const WOK = {
  id: 7,
  title: 'Wok',
  description: null,
  servings: 2,
  steps: [],
  variations: [
    {
      id: 4,
      name: 'Met cashew',
      notes: null,
      lock_version: 0,
      changes: [
        {
          id: 1,
          kind: 'add',
          recipe_ingredient_id: null,
          name: 'cashewnoten',
          quantity: 50,
          unit: 'g',
        },
      ],
      tag_changes: [],
    },
  ],
  ingredients: [
    {
      id: 1,
      ingredient_id: 20,
      name: 'kip',
      quantity: 200,
      unit: 'g',
      optional: false,
      alternatives: [
        {
          id: 3,
          ingredient_id: 21,
          name: 'tofu',
          quantity: null,
          unit: null,
          effective_quantity: 200,
          effective_unit: 'g',
        },
      ],
    },
    {
      id: 2,
      ingredient_id: 22,
      name: 'rijst',
      quantity: 150,
      unit: 'g',
      optional: false,
      alternatives: [],
    },
    {
      id: 5,
      ingredient_id: 23,
      name: 'ui',
      quantity: 1,
      unit: 'stuks',
      optional: false,
      alternatives: [],
    },
  ],
}

// De boodschappenlijst van fakeServer, plus het recept en "op lijst".
function serve(shopping) {
  const server = fakeServer({ shopping })
  const shoppingFetch = globalThis.fetch.getMockImplementation()
  mockFetch((method, url, options) => {
    if (url === '/api/recipes/7') return jsonResponse(structuredClone(WOK))
    if (url === '/api/tags') return jsonResponse([])
    if (url === '/api/recipes/7/add_to_shopping_list') {
      const line = {
        id: 500,
        name: 'kip',
        ingredient_id: 20,
        recipe_id: 7,
        source_label: 'Wok',
        checked: false,
      }
      server.shoppingDb.push(line)
      return jsonResponse([line], 201)
    }
    return shoppingFetch(url, options)
  })
  return server
}

async function mountAt(path) {
  setActivePinia(createPinia())
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push(path)
  const wrapper = mount(RouterView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

function rowButton(wrapper, rowId) {
  return wrapper.find(`.ingredients li[data-id="${rowId}"] .list-button`)
}

describe('RecipeDetailView: wat al op de boodschappenlijst staat', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('toont per ingrediënt "+ lijst", "✓ op lijst" of "✓ via …"', async () => {
    serve([
      {
        id: 1,
        name: 'rijst',
        ingredient_id: 22,
        recipe_id: 7,
        source_label: 'Wok',
        checked: false,
      },
      {
        id: 2,
        name: 'ui',
        ingredient_id: null,
        recipe_id: null,
        source_label: 'standaard',
        checked: false,
      },
    ])
    const wrapper = await mountAt('/recepten/7')

    expect(rowButton(wrapper, 1).text()).toBe('+ lijst')
    expect(rowButton(wrapper, 2).text()).toBe('✓ op lijst')
    expect(rowButton(wrapper, 2).attributes('disabled')).toBeUndefined()
    expect(rowButton(wrapper, 5).text()).toBe('✓ via standaardlijst')
    expect(rowButton(wrapper, 5).attributes('disabled')).toBeDefined()
  })

  it('"+ lijst" wordt meteen "✓ op lijst", en een tik daarop haalt het weer weg', async () => {
    const { shoppingDb } = serve([])
    const wrapper = await mountAt('/recepten/7')

    await rowButton(wrapper, 1).trigger('click')
    await flushPromises()
    expect(rowButton(wrapper, 1).text()).toBe('✓ op lijst')

    await rowButton(wrapper, 1).trigger('click')
    await flushPromises()
    expect(rowButton(wrapper, 1).text()).toBe('+ lijst')
    expect(shoppingDb).toEqual([])
    expect(wrapper.find('[role="status"]').text()).toBe('kip is van je boodschappenlijst gehaald.')
  })

  it('volgt het gewisselde alternatief', async () => {
    serve([
      {
        id: 1,
        name: 'tofu',
        ingredient_id: 21,
        recipe_id: 9,
        source_label: 'Curry',
        checked: false,
      },
    ])
    const wrapper = await mountAt('/recepten/7')
    expect(rowButton(wrapper, 1).text()).toBe('+ lijst')

    await wrapper.find('button[aria-label="Wissel voor tofu"]').trigger('click')
    await flushPromises()

    expect(rowButton(wrapper, 1).text()).toBe('✓ via Curry')
  })

  it('een toevoeging van een variatie heeft dezelfde knop', async () => {
    const { shoppingDb } = serve([])
    const wrapper = await mountAt('/recepten/7')
    const addition = () => wrapper.find('.variation-card .change.added .list-button')

    expect(addition().text()).toBe('+ lijst')
    await addition().trigger('click')
    await flushPromises()

    expect(
      shoppingDb.map((i) => [i.name, i.quantity, i.unit, i.recipe_id, i.source_label]),
    ).toEqual([['cashewnoten', 50, 'g', 7, 'Wok (variatie: Met cashew)']])
    expect(addition().text()).toBe('✓ op lijst')
  })
})
