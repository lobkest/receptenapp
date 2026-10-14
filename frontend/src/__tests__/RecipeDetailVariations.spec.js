import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import { routes } from '../router'
import { jsonResponse, mockFetch } from './helpers'

const CHICKEN = {
  id: 7,
  name: 'Met kip',
  notes: null,
  lock_version: 0,
  changes: [
    { id: 1, kind: 'remove', recipe_ingredient_id: 1, name: 'tofu', quantity: null, unit: null },
    { id: 2, kind: 'add', recipe_ingredient_id: null, name: 'kip', quantity: 150, unit: 'g' },
  ],
  tag_changes: [{ kind: 'remove', tag: 'vega' }],
}

function curry(variations = [CHICKEN]) {
  return {
    id: 5,
    title: 'Curry',
    description: null,
    servings: 2,
    tags: ['snel', 'vega'],
    lock_version: 0,
    ingredients: [
      { id: 1, name: 'tofu', quantity: 200, unit: 'g', optional: false },
      { id: 2, name: 'rijst', quantity: 150, unit: 'g', optional: false },
    ],
    steps: [{ id: 11, position: 1, body: 'Koken.' }],
    variations,
  }
}

// Een nep-API voor de receptpagina met variaties. handlers vult of vervangt routes.
function fakeApi(recipe = curry(), handlers = {}) {
  return mockFetch((method, url, options) => {
    const key = `${method} ${url}`
    if (handlers[key]) return handlers[key](JSON.parse(options.body ?? '{}'))
    if (key === 'GET /api/recipes/5') return jsonResponse(recipe)
    if (key === 'GET /api/tags')
      return jsonResponse([{ name: 'snel' }, { name: 'vega' }, { name: 'vis' }])
    return jsonResponse([])
  })
}

async function mountAt(path) {
  setActivePinia(createPinia())
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push(path)
  const wrapper = mount(RouterView, { global: { plugins: [router] }, attachTo: document.body })
  await flushPromises()
  return wrapper
}

function buttonWithText(root, text) {
  return root.findAll('button').find((b) => b.text() === text)
}

describe('RecipeDetailView: tags en variaties', () => {
  let wrapper

  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
  })

  afterEach(() => {
    wrapper?.unmount()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('toont de tags van het recept onder de titel', async () => {
    fakeApi()
    wrapper = await mountAt('/recepten/5')

    expect(wrapper.findAll('.recipe-tags .tag').map((t) => t.text())).toEqual(['snel', 'vega'])
  })

  it('toont de variaties als kaarten in een grid, met de porties-teller meegeschaald', async () => {
    const second = { ...CHICKEN, id: 8, name: 'Met vis', changes: [], tag_changes: [] }
    fakeApi(curry([CHICKEN, second, { ...second, id: 9, name: 'Pittig' }]))
    wrapper = await mountAt('/recepten/5')

    const cards = wrapper.findAll('.variation-grid .variation-card')
    expect(cards.map((c) => c.find('h3').text())).toEqual(['Met kip', 'Met vis', 'Pittig'])
    expect(cards[0].find('.change.added').text()).toBe('+ 150 g kip')

    await wrapper.find('[aria-label="Meer porties"]').trigger('click') // 2 → 3 porties
    expect(cards[0].find('.change.added').text()).toBe('+ 225 g kip')
  })

  it('zonder variaties: een korte melding en de knop "Voeg variatie toe"', async () => {
    fakeApi(curry([]))
    wrapper = await mountAt('/recepten/5')

    expect(wrapper.find('section.variations').text()).toContain('Nog geen variaties.')
    expect(buttonWithText(wrapper, 'Voeg variatie toe').exists()).toBe(true)
  })

  it('"Voeg variatie toe" klapt het formulier open en voegt de variatie toe', async () => {
    const created = { ...CHICKEN, id: 12, name: 'Met vis' }
    const fetch = fakeApi(curry([]), {
      'POST /api/recipes/5/variations': () => jsonResponse(created, 201),
    })
    wrapper = await mountAt('/recepten/5')

    await buttonWithText(wrapper, 'Voeg variatie toe').trigger('click')
    const form = wrapper.find('form.variation-form')
    expect(form.findAll('label.check').map((l) => l.text())).toContain('tofu 200 g')
    // "Tag erbij" biedt alleen tags die het recept niet heeft.
    expect(form.findAll('.tag-select option').map((o) => o.text())).toContain('vis')
    expect(form.findAll('.tag-select option').map((o) => o.text())).not.toContain('vega')

    await form.find('input[type="text"]').setValue('Met vis')
    await form.find('label.check input').setValue(true) // tofu
    await form.trigger('submit')
    await flushPromises()

    const post = fetch.mock.calls.find(([, o]) => o?.method === 'POST')
    expect(post[0]).toBe('/api/recipes/5/variations')
    expect(JSON.parse(post[1].body).variation).toMatchObject({
      name: 'Met vis',
      removed_ingredient_ids: [1],
    })
    expect(wrapper.find('form.variation-form').exists()).toBe(false)
    expect(wrapper.findAll('.variation-card h3').map((h) => h.text())).toEqual(['Met vis'])
    expect(wrapper.find('section.variations [role="status"]').text()).toBe(
      '"Met vis" is toegevoegd.',
    )
  })

  it('bewerkt een variatie op haar plek, met lock_version, en meldt een conflict', async () => {
    const fetch = fakeApi(curry(), {
      'PATCH /api/recipes/5/variations/7': () =>
        jsonResponse({ error: 'Deze variatie is intussen door iemand anders gewijzigd.' }, 409),
    })
    wrapper = await mountAt('/recepten/5')

    await buttonWithText(wrapper.find('.variation-card'), 'Bewerken').trigger('click')
    const form = wrapper.find('.variation-grid form.variation-form')
    expect(form.classes()).toContain('wide')
    await form.trigger('submit')
    await flushPromises()

    const patch = fetch.mock.calls.find(([, o]) => o?.method === 'PATCH')
    expect(JSON.parse(patch[1].body).variation.lock_version).toBe(0)
    expect(wrapper.find('section.variations [role="alert"]').text()).toContain(
      'Deze variatie is intussen door iemand anders gewijzigd.',
    )
    expect(buttonWithText(wrapper, 'Nieuwste versie laden').exists()).toBe(true)
  })

  it('"Variatie op lijst" stuurt de gekozen porties naar de server', async () => {
    const fetch = fakeApi(curry(), {
      'POST /api/recipes/5/variations/7/add_to_shopping_list': () =>
        jsonResponse([{ id: 1, name: 'rijst', quantity: 300, unit: 'g', checked: false }], 201),
    })
    wrapper = await mountAt('/recepten/5')

    await wrapper.find('[aria-label="Meer porties"]').trigger('click') // 3 porties
    await buttonWithText(wrapper.find('.variation-card'), 'Variatie op lijst').trigger('click')
    await flushPromises()

    const post = fetch.mock.calls.find(([url]) => url.endsWith('add_to_shopping_list'))
    expect(JSON.parse(post[1].body)).toEqual({ servings: 3 })
    expect(wrapper.find('section.variations [role="status"]').text()).toBe(
      '"Met kip" staat op je boodschappenlijst.',
    )
  })

  it('verwijderen is een verzoek met reden; de kaart verdwijnt', async () => {
    const fetch = fakeApi(curry(), {
      'POST /api/recipes/5/variations/7/request_deletion': () =>
        new Response(null, { status: 204 }),
    })
    wrapper = await mountAt('/recepten/5')

    await buttonWithText(wrapper.find('.variation-card'), 'Verwijderen').trigger('click')
    await flushPromises()
    const dialog = wrapper.find('dialog')
    expect(dialog.find('h2').text()).toBe('"Met kip" verwijderen?')
    await dialog.find('textarea').setValue('dubbel')
    await dialog.find('.confirm').trigger('click')
    await flushPromises()

    const post = fetch.mock.calls.find(([url]) => url.endsWith('request_deletion'))
    expect(JSON.parse(post[1].body)).toEqual({ reason: 'dubbel' })
    expect(wrapper.findAll('.variation-card')).toHaveLength(0)
    expect(wrapper.find('section.variations [role="status"]').text()).toBe(
      '"Met kip" is verwijderd.',
    )
  })
})
