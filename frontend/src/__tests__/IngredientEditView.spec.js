import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import { routes } from '../router'
import { jsonResponse, mockFetch } from './helpers'
import { mountRoute } from './mount'

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
const TRAITS = [
  { name: 'vlees', excluded_by: ['vegetarisch'] },
  { name: 'vis', excluded_by: ['vegetarisch'] },
  { name: 'dierlijk', excluded_by: ['veganistisch'] },
  { name: 'gluten', excluded_by: ['glutenvrij'] },
  { name: 'lactose', excluded_by: ['lactosevrij'] },
]

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
    traits: ['dierlijk'],
    traits_checked: false,
    ...overrides,
  }
}

function fakeApi(
  ingredient = egg(),
  patch = (body) => jsonResponse(egg({ ...body, needs_review: false })),
  patchTraits = (body) =>
    jsonResponse({
      traits: body.trait_names ?? ingredient.traits,
      traits_checked: body.traits_checked ?? false,
    }),
) {
  return mockFetch((method, url, options) => {
    if (url === '/api/traits') return jsonResponse(TRAITS)
    if (url === '/api/ingredients/2/traits' && method === 'PATCH')
      return patchTraits(JSON.parse(options.body).ingredient)
    if (url === '/api/ingredients/2' && method === 'GET') return jsonResponse(ingredient)
    if (url === '/api/ingredients/2' && method === 'PATCH')
      return patch(JSON.parse(options.body).ingredient)
    if (url.startsWith('/api/nevo_foods?q=')) return jsonResponse([EGG_FOOD, BOILED])
    throw new Error(`Onverwacht: ${method} ${url}`)
  })
}

async function mountAt(path) {
  const { wrapper } = await mountRoute(path)
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
      negligible: false,
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

  it('verwaarloosbaar: vinkje met uitleg, opslaan stuurt het mee', async () => {
    const fetch = fakeApi(egg({ nevo_food: null }))
    const wrapper = await mountAt('/ingredienten/2')

    const box = wrapper.find('#negligible')
    expect(box.element.checked).toBe(false)
    expect(wrapper.find('.negligible').text()).toContain('bakpoeder of specerijen')
    await box.setValue(true)
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(patchBody(fetch).negligible).toBe(true)
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

describe('IngredientEditView: samenvoegen', () => {
  const LIST = [
    { id: 2, name: 'ei', nevo_food: EGG_FOOD, label_values: false, needs_review: false },
    { id: 5, name: 'eieren', nevo_food: null, label_values: false, needs_review: false },
    { id: 6, name: 'eiwit', nevo_food: null, label_values: false, needs_review: false },
  ]

  afterEach(() => {
    vi.unstubAllGlobals()
    sessionStorage.clear()
  })

  // Het bewerkscherm van "eieren" (5); samenvoegen met "ei" (2).
  function fakeMergeApi(mergeResponse) {
    const eieren = egg({ id: 5, name: 'eieren', nevo_food: null, needs_review: false })
    return mockFetch((method, url) => {
      if (url === '/api/ingredients/5' && method === 'GET') return jsonResponse(eieren)
      if (url === '/api/ingredients/2' && method === 'GET')
        return jsonResponse(egg({ needs_review: false }))
      if (url === '/api/ingredients') return jsonResponse(LIST)
      if (url.startsWith('/api/nevo_foods')) return jsonResponse([])
      if (url === '/api/admin/ingredients/5/merge') return mergeResponse()
      throw new Error(`Onverwacht: ${method} ${url}`)
    })
  }

  const merged = (overrides = {}) =>
    jsonResponse({
      target: egg({ needs_review: false }),
      source_deleted: true,
      moved_recipes: ['Pannenkoeken'],
      skipped_recipes: [],
      copied: [],
      ...overrides,
    })

  async function chooseTarget(wrapper, query = 'ei') {
    await wrapper.find('.start-merge').trigger('click')
    await flushPromises()
    await wrapper.find('#merge-search').setValue(query)
  }

  async function mountRouted(path) {
    setActivePinia(createPinia())
    const router = createRouter({ history: createMemoryHistory(), routes })
    await router.push(path)
    const wrapper = mount(RouterView, { global: { plugins: [router] }, attachTo: document.body })
    await flushPromises()
    return { wrapper, router }
  }

  it('kandidaten: wat precies zo heet bovenaan, daarna op naam (zoals op "In huis")', async () => {
    const aardbei = {
      id: 7,
      name: 'aardbei',
      nevo_food: null,
      label_values: false,
      needs_review: false,
    }
    const eieren = egg({ id: 5, name: 'eieren', nevo_food: null, needs_review: false })
    mockFetch((method, url) => {
      if (url === '/api/ingredients/5' && method === 'GET') return jsonResponse(eieren)
      if (url === '/api/ingredients') return jsonResponse([aardbei, ...LIST])
      if (url.startsWith('/api/nevo_foods')) return jsonResponse([])
      throw new Error(`Onverwacht: ${method} ${url}`)
    })
    const { wrapper } = await mountRouted('/ingredienten/5')

    await chooseTarget(wrapper, 'ei')
    const names = wrapper.findAll('.merge .results li .food-name').map((c) => c.text())
    // Niet "eieren" zelf; "ei" bovenaan, ook al komt "aardbei" op naam eerder.
    expect(names).toEqual(['ei', 'aardbei', 'eiwit'])
  })

  it('zonder beheercode: het venster vraagt de code; daarna naar het doel met een melding', async () => {
    const fetch = fakeMergeApi(() => merged())
    const { wrapper, router } = await mountRouted('/ingredienten/5')

    await chooseTarget(wrapper)
    const candidates = wrapper.findAll('.merge .results li')
    expect(candidates.map((c) => c.find('.food-name').text())).toEqual(['ei', 'eiwit'])
    await candidates[0].find('button').trigger('click')

    const dialog = wrapper.find('dialog')
    expect(dialog.find('h2').text()).toBe('"eieren" samenvoegen met "ei"?')
    expect(dialog.find('input[type="password"]').exists()).toBe(true)
    await dialog.find('input[type="password"]').setValue('geheim')
    await dialog.find('.confirm').trigger('click')
    await flushPromises()

    const call = fetch.mock.calls.find((c) => c[0] === '/api/admin/ingredients/5/merge')
    expect(call[1].method).toBe('POST')
    expect(call[1].headers.Authorization).toBe('Bearer geheim')
    expect(JSON.parse(call[1].body)).toEqual({ target_id: 2 })
    expect(router.currentRoute.value.path).toBe('/ingredienten/2')
    expect(wrapper.find('.notice-success').text()).toBe('"eieren" is samengevoegd met "ei".')
    wrapper.unmount()
  })

  it('ingelogd: alleen bevestigen; Annuleren doet niets', async () => {
    sessionStorage.setItem('adminCode', 'geheim')
    const fetch = fakeMergeApi(() => merged())
    const { wrapper } = await mountRouted('/ingredienten/5')

    await chooseTarget(wrapper)
    await wrapper.find('.merge .results button').trigger('click')
    expect(wrapper.find('dialog input').exists()).toBe(false)
    await wrapper.find('dialog .cancel').trigger('click')
    await flushPromises()

    expect(fetch.mock.calls.some((c) => c[0].includes('/merge'))).toBe(false)
    wrapper.unmount()
  })

  it('een recept met allebei: blijft staan en noemt het recept', async () => {
    sessionStorage.setItem('adminCode', 'geheim')
    fakeMergeApi(() => merged({ source_deleted: false, skipped_recipes: ['Omelet'] }))
    const { wrapper, router } = await mountRouted('/ingredienten/5')

    await chooseTarget(wrapper)
    await wrapper.find('.merge .results button').trigger('click')
    await wrapper.find('dialog .confirm').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/ingredienten/5')
    expect(wrapper.find('.notice-success').text()).toContain(
      'Overgeslagen, want het recept bevat ze allebei: Omelet.',
    )
    wrapper.unmount()
  })

  it('een onjuiste code: een melding, niets veranderd', async () => {
    fakeMergeApi(() => jsonResponse({ error: 'De beheercode is onjuist of verlopen.' }, 401))
    const { wrapper, router } = await mountRouted('/ingredienten/5')

    await chooseTarget(wrapper)
    await wrapper.find('.merge .results button').trigger('click')
    await wrapper.find('dialog input[type="password"]').setValue('fout')
    await wrapper.find('dialog .confirm').trigger('click')
    await flushPromises()

    expect(wrapper.find('.merge .error').text()).toBe('De beheercode is onjuist.')
    expect(router.currentRoute.value.path).toBe('/ingredienten/5')
    expect(sessionStorage.getItem('adminCode')).toBeNull()
    wrapper.unmount()
  })

  describe('kenmerken', () => {
    const traitBoxes = (wrapper) => wrapper.findAll('.trait-option')
    const checked = (wrapper) =>
      traitBoxes(wrapper)
        .filter((label) => label.find('input').element.checked)
        .map((label) => label.text())

    it('toont de vinkjes, het gevolg en "nog te controleren"', async () => {
      fakeApi()
      const wrapper = await mountAt('/ingredienten/2')

      expect(traitBoxes(wrapper).map((label) => label.text())).toEqual([
        'vlees',
        'vis',
        'dierlijk',
        'gluten',
        'lactose',
      ])
      expect(checked(wrapper)).toEqual(['dierlijk'])
      expect(wrapper.find('.consequence').text()).toBe('→ niet veganistisch')
      expect(wrapper.find('.trait-badge').text()).toBe('nog te controleren')
    })

    it('een vinkje slaat meteen op via .../traits, zonder lock_version, en past het gevolg aan', async () => {
      const fetch = fakeApi()
      const wrapper = await mountAt('/ingredienten/2')

      await traitBoxes(wrapper)[0].find('input').setValue(true)
      expect(wrapper.find('.consequence').text()).toBe('→ niet vegetarisch, niet veganistisch')
      await flushPromises()

      const call = fetch.mock.calls.find((c) => c[0] === '/api/ingredients/2/traits')
      expect(call[1].method).toBe('PATCH')
      expect(JSON.parse(call[1].body)).toEqual({
        ingredient: { trait_names: ['vlees', 'dierlijk'] },
      })
      expect(
        fetch.mock.calls.some((c) => c[0] === '/api/ingredients/2' && c[1]?.method === 'PATCH'),
      ).toBe(false)
      expect(wrapper.find('[role="status"]').text()).toBe('Kenmerken opgeslagen.')
      expect(checked(wrapper)).toEqual(['vlees', 'dierlijk'])
    })

    it('Gecontroleerd zet traits_checked; de knop verdwijnt dan', async () => {
      const fetch = fakeApi()
      const wrapper = await mountAt('/ingredienten/2')

      await wrapper.find('.mark-checked').trigger('click')
      await flushPromises()

      const call = fetch.mock.calls.find((c) => c[0] === '/api/ingredients/2/traits')
      expect(JSON.parse(call[1].body)).toEqual({ ingredient: { traits_checked: true } })
      expect(wrapper.find('.mark-checked').exists()).toBe(false)
      expect(wrapper.find('.trait-badge').text()).toBe('gecontroleerd')
    })

    it('een fout bij opslaan toont een melding', async () => {
      fakeApi(egg(), undefined, () => jsonResponse({ error: 'Er ging iets mis.', errors: {} }, 500))
      const wrapper = await mountAt('/ingredienten/2')

      await traitBoxes(wrapper)[3].find('input').setValue(true)
      await flushPromises()
      expect(wrapper.find('.traits [role="alert"]').exists()).toBe(true)
    })
  })
})

describe('IngredientEditView: basis', () => {
  afterEach(() => vi.unstubAllGlobals())

  function fakeStapleApi(respond = (body) => jsonResponse({ ...egg(), staple: body.staple })) {
    return mockFetch((method, url, options) => {
      if (url === '/api/traits') return jsonResponse(TRAITS)
      if (url === '/api/ingredients/2' && method === 'GET')
        return jsonResponse(egg({ staple: false }))
      if (url === '/api/ingredients/2/staple' && method === 'PATCH')
        return respond(JSON.parse(options.body).ingredient)
      if (url.startsWith('/api/nevo_foods?q=')) return jsonResponse([])
      throw new Error(`Onverwacht: ${method} ${url}`)
    })
  }

  it('de schakelaar slaat meteen op via .../staple, zonder lock_version en los van het formulier', async () => {
    const fetch = fakeStapleApi()
    const wrapper = await mountAt('/ingredienten/2')

    const box = wrapper.find('#staple')
    expect(box.element.checked).toBe(false)
    expect(wrapper.find('.staple').text()).toContain('Basis')
    // Niet in het NEVO-formulier: opslaan daar stuurt hem niet mee.
    expect(wrapper.find('form #staple').exists()).toBe(false)

    box.element.checked = true
    await box.trigger('change')
    await flushPromises()

    const call = fetch.mock.calls.find(([url]) => url === '/api/ingredients/2/staple')
    expect(JSON.parse(call[1].body)).toEqual({ ingredient: { staple: true } })
    expect(wrapper.find('#staple').element.checked).toBe(true)
    expect(wrapper.find('.staple [role="status"]').text()).toBe('Staat nu in de basis.')
  })

  it('een fout zet het vinkje terug en toont een melding', async () => {
    fakeStapleApi(() => jsonResponse({ error: 'Te veel verzoeken.' }, 429))
    const wrapper = await mountAt('/ingredienten/2')

    const box = wrapper.find('#staple')
    box.element.checked = true
    await box.trigger('change')
    await flushPromises()

    expect(box.element.checked).toBe(false)
    expect(wrapper.find('.staple [role="alert"]').text()).toBe('Te veel verzoeken.')
  })
})
