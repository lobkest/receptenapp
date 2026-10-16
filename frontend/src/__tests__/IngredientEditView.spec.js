import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import { routes } from '../router'
import { jsonResponse, mockFetch } from './helpers'

const EGG_FOOD = {
  id: 71,
  code: 83,
  name: 'Kippeneieren rauw',
  official_name: 'Ei kippen- rauw gem',
  unit: 'g',
  version: '2025/9.0',
  kcal: 132,
  protein: 12.3,
  carbohydrates: 0.2,
  fat: 9.1,
  fiber: null,
}
const BOILED = {
  ...EGG_FOOD,
  id: 72,
  code: 84,
  name: 'Kippeneieren gekookt',
  official_name: 'Ei kippen- gekookt gem',
  kcal: 128,
}
const NO_LABEL = { kcal: null, protein: null, carbohydrates: null, fat: null, fiber: null }

function egg(overrides = {}) {
  return {
    id: 2,
    name: 'ei',
    lock_version: 3,
    needs_review: true,
    label_values: false,
    nevo_food: EGG_FOOD,
    grams_per_piece: 50,
    grams_per_ml: null,
    label: NO_LABEL,
    units: ['stuks', 'tl'],
    ...overrides,
  }
}

function fakeApi(
  ingredient = egg(),
  patch = (body) => jsonResponse(egg({ ...body, needs_review: false })),
) {
  return mockFetch((method, url, options) => {
    if (url === '/api/ingredients/2' && method === 'GET') return jsonResponse(ingredient)
    if (url === '/api/ingredients/2' && method === 'PATCH')
      return patch(JSON.parse(options.body).ingredient)
    if (url.startsWith('/api/nevo_foods?q=')) return jsonResponse([EGG_FOOD, BOILED])
    throw new Error(`Onverwacht: ${method} ${url}`)
  })
}

async function mountAt(path) {
  setActivePinia(createPinia())
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push(path)
  const wrapper = mount(RouterView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

const patchBody = (fetch) =>
  JSON.parse(fetch.mock.calls.find((c) => c[1]?.method === 'PATCH')[1].body).ingredient

describe('IngredientEditView', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('toont het gekoppelde product met kcal en eiwit per 100 g, en suggesties op de naam', async () => {
    const fetch = fakeApi()
    const wrapper = await mountAt('/ingredienten/2')

    expect(wrapper.find('h1').text()).toBe('ei')
    expect(wrapper.find('.chosen .food-name').text()).toBe('Kippeneieren rauw')
    expect(wrapper.find('.chosen').text()).toContain('NEVO: Ei kippen- rauw gem (83)')
    expect(wrapper.find('.chosen').text()).toContain('per 100 g: 132 kcal · 12,3 g eiwit')
    expect(fetch).toHaveBeenCalledWith('/api/nevo_foods?q=ei', expect.anything())
    const results = wrapper.findAll('.results li')
    expect(results.map((r) => r.find('.food-name').text())).toEqual([
      'Kippeneieren rauw',
      'Kippeneieren gekookt',
    ])
    expect(results[0].find('button').text()).toBe('Gekozen')
    expect(results[1].find('button').text()).toBe('Kies')
  })

  it('kiezen en opslaan stuurt het NEVO-product, de omrekening en de etiketwaarden', async () => {
    const fetch = fakeApi()
    const wrapper = await mountAt('/ingredienten/2')

    await wrapper.findAll('.results button')[1].trigger('click')
    expect(wrapper.find('.chosen .food-name').text()).toBe('Kippeneieren gekookt')
    expect(wrapper.find('.changed').text()).toBe('Nog niet opgeslagen')
    await wrapper.find('#grams-per-ml').setValue('1,03')
    await wrapper.find('#label-kcal').setValue('140')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(patchBody(fetch)).toEqual({
      lock_version: 3,
      nevo_food_id: 72,
      grams_per_piece: '50',
      grams_per_ml: '1,03',
      label_kcal: '140',
      label_protein: null,
      label_carbohydrates: null,
      label_fat: null,
      label_fiber: null,
    })
    expect(wrapper.find('.notice-success').text()).toBe('Opgeslagen.')
  })

  it('toont per voedingsstof de bron: etiket als ingevuld, anders NEVO of onbekend', async () => {
    fakeApi()
    const wrapper = await mountAt('/ingredienten/2')
    const sourceOf = (key) =>
      wrapper
        .find(`#label-${key}`)
        .element.closest('.field')
        .querySelector('.source')
        .textContent.trim()

    expect(sourceOf('kcal')).toBe('bron: NEVO')
    expect(sourceOf('fiber')).toBe('bron: onbekend')
    expect(wrapper.find('#label-kcal').attributes('placeholder')).toBe('NEVO: 132')
    await wrapper.find('#label-kcal').setValue('140')
    expect(sourceOf('kcal')).toBe('bron: etiket')
  })

  it('"Klopt" stuurt alleen lock_version en haalt "te controleren" weg', async () => {
    const fetch = fakeApi()
    const wrapper = await mountAt('/ingredienten/2')

    expect(wrapper.find('.review').text()).toContain('Te controleren.')
    await wrapper.find('.review button').trigger('click')
    await flushPromises()

    expect(patchBody(fetch)).toEqual({ lock_version: 3 })
    expect(wrapper.find('.review').exists()).toBe(false)
    expect(wrapper.find('.notice-success').text()).toBe('Gecontroleerd.')
  })

  it('wijst op een ontbrekende omrekening voor de eenheden die recepten gebruiken', async () => {
    fakeApi(egg({ grams_per_piece: null }))
    const wrapper = await mountAt('/ingredienten/2')

    expect(wrapper.text()).toContain('Recepten gebruiken dit in: stuks, tl.')
    expect(wrapper.findAll('.hint').map((h) => h.text())).toEqual([
      'Nodig voor stuks',
      'Nodig voor ml, tl en el',
    ])
  })

  it('ontkoppelen stuurt nevo_food_id null', async () => {
    const fetch = fakeApi()
    const wrapper = await mountAt('/ingredienten/2')

    await wrapper.find('.unlink').trigger('click')
    expect(wrapper.find('.chosen').exists()).toBe(false)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(patchBody(fetch).nevo_food_id).toBeNull()
  })

  it('validatiefouten staan bij het veld; een conflict biedt herladen', async () => {
    let status = 422
    fakeApi(egg(), () =>
      status === 422
        ? jsonResponse(
            {
              error: 'Controleer de ingevulde velden.',
              errors: { grams_per_piece: ['moet groter zijn dan 0'] },
            },
            422,
          )
        : jsonResponse(
            { error: 'Dit ingrediënt is intussen door iemand anders gewijzigd.', errors: {} },
            409,
          ),
    )
    const wrapper = await mountAt('/ingredienten/2')

    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('#grams-per-piece').attributes('aria-invalid')).toBe('true')
    expect(wrapper.find('#grams-per-piece + .error').text()).toBe('moet groter zijn dan 0')

    status = 409
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('.notice-error').text()).toContain('door iemand anders gewijzigd')
    expect(wrapper.find('.notice-error .reload').text()).toBe('Herladen')
  })

  it('zoeken wacht even na het typen', async () => {
    vi.useFakeTimers()
    const fetch = fakeApi()
    const wrapper = await mountAt('/ingredienten/2')
    const searches = () => fetch.mock.calls.filter((c) => c[0].startsWith('/api/nevo_foods')).length

    await wrapper.find('#nevo-search').setValue('eier')
    await wrapper.find('#nevo-search').trigger('input')
    expect(searches()).toBe(1)
    await vi.advanceTimersByTimeAsync(300)
    expect(searches()).toBe(2)
    expect(fetch).toHaveBeenLastCalledWith('/api/nevo_foods?q=eier', expect.anything())
  })

  it('een onbekend ingrediënt', async () => {
    mockFetch(() => jsonResponse({ error: 'Ingrediënt niet gevonden.' }, 404))
    const wrapper = await mountAt('/ingredienten/99')
    expect(wrapper.find('h1').text()).toBe('Ingrediënt niet gevonden')
  })
})
