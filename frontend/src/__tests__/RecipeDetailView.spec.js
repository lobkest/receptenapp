import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import { routes } from '../router'
import { fakeServer, jsonResponse, mockFetch } from './helpers'

const SOUP = { id: 5, title: 'Tomatensoep', description: 'Lekker.', servings: 4 }

// attach: aan het document hangen, nodig om te kunnen controleren waar de focus staat.
async function mountAt(path, { attach = false } = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push(path)
  const wrapper = mount(RouterView, {
    global: { plugins: [pinia, router] },
    attachTo: attach ? document.body : undefined,
  })
  await flushPromises()
  return { wrapper, router }
}

describe('RecipeDetailView', () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('toont Bewerken en Verwijderen voor iedereen, Versies alleen voor de beheerder', async () => {
    mockFetch(() => jsonResponse(SOUP))
    const { wrapper } = await mountAt('/recepten/5')

    const actions = wrapper.find('.recipe-actions')
    expect(actions.find('a.edit').attributes('href')).toBe('/recepten/5/bewerken')
    expect(actions.find('button.delete').text()).toBe('Verwijderen')
    expect(actions.find('a.versions').exists()).toBe(false)
  })

  it('toont voor de beheerder ook een link naar de versies', async () => {
    sessionStorage.setItem('adminCode', 'geheim')
    mockFetch(() => jsonResponse(SOUP))
    const { wrapper } = await mountAt('/recepten/5')

    expect(wrapper.find('.recipe-actions a.versions').attributes('href')).toBe(
      '/beheer/recepten/5/versies',
    )
  })

  describe('verwijderen aanvragen', () => {
    function fakeApi() {
      return mockFetch((method, url) => {
        if (url === '/api/recipes/5/request_deletion') return new Response(null, { status: 204 })
        if (url === '/api/recipes/5') return jsonResponse(SOUP)
        return jsonResponse([])
      })
    }

    async function openDialog(wrapper) {
      await wrapper.find('.recipe-actions button.delete').trigger('click')
      await flushPromises()
      return wrapper.find('dialog')
    }

    it('vraagt eerst om bevestiging, met een optioneel veld Reden en focus op Annuleren', async () => {
      fakeApi()
      const { wrapper } = await mountAt('/recepten/5', { attach: true })

      const dialog = await openDialog(wrapper)

      expect(dialog.attributes('open')).toBeDefined()
      expect(dialog.find('h2').text()).toBe('"Tomatensoep" verwijderen?')
      expect(dialog.find('label').text()).toBe('Reden (optioneel)')
      expect(document.activeElement).toBe(dialog.find('.cancel').element)
      wrapper.unmount()
    })

    it('doet niets als je annuleert', async () => {
      const fetch = fakeApi()
      const { wrapper, router } = await mountAt('/recepten/5')

      const dialog = await openDialog(wrapper)
      await dialog.find('textarea').setValue('dubbel')
      await dialog.find('.cancel').trigger('click')
      await flushPromises()

      expect(fetch.mock.calls.some(([url]) => url.endsWith('request_deletion'))).toBe(false)
      expect(router.currentRoute.value.path).toBe('/recepten/5')
    })

    it('stuurt de reden mee, en toont het overzicht met een melding', async () => {
      const fetch = fakeApi()
      const { wrapper, router } = await mountAt('/recepten/5')

      const dialog = await openDialog(wrapper)
      await dialog.find('textarea').setValue('  staat er dubbel in ')
      await dialog.find('.confirm').trigger('click')
      await flushPromises()

      const request = fetch.mock.calls.find(([url]) => url.endsWith('request_deletion'))
      expect(request[1].method).toBe('POST')
      expect(JSON.parse(request[1].body)).toEqual({ reason: 'staat er dubbel in' })
      expect(router.currentRoute.value.name).toBe('recipes')
      expect(wrapper.find('[role="status"]').text()).toBe('"Tomatensoep" is verwijderd.')
    })

    it('stuurt een lege reden als je niets invult', async () => {
      const fetch = fakeApi()
      const { wrapper } = await mountAt('/recepten/5')

      const dialog = await openDialog(wrapper)
      await dialog.find('.confirm').trigger('click')
      await flushPromises()

      const request = fetch.mock.calls.find(([url]) => url.endsWith('request_deletion'))
      expect(JSON.parse(request[1].body)).toEqual({ reason: '' })
    })
  })

  it('toont ingrediënten en genummerde stappen', async () => {
    mockFetch(() =>
      jsonResponse({
        ...SOUP,
        ingredients: [
          { id: 1, name: 'bloem', quantity: 200, unit: 'g', optional: false },
          { id: 2, name: 'ei', quantity: 2, unit: 'stuks', optional: false },
          { id: 3, name: 'olie', quantity: 0.5, unit: 'ml', optional: false },
          { id: 4, name: 'ui', quantity: 1, unit: 'stuks', optional: false },
          { id: 5, name: 'zout', quantity: null, unit: null, optional: false },
        ],
        steps: [
          { id: 11, position: 1, body: 'Snijden.' },
          { id: 12, position: 2, body: 'Koken.' },
        ],
      }),
    )
    const { wrapper } = await mountAt('/recepten/5')

    expect(wrapper.findAll('.ingredients .line').map((line) => line.text())).toEqual([
      '200 g bloem',
      '2 stuks ei',
      '0,5 ml olie',
      '1 stuks ui',
      'zout — naar smaak',
    ])
    expect(wrapper.find('.steps ol').exists()).toBe(true)
    expect(wrapper.findAll('.steps ol li').map((li) => li.text())).toEqual(['Snijden.', 'Koken.'])
  })

  it('toont bij een ouder recept zonder ingrediënten en stappen geen lege kopjes', async () => {
    mockFetch(() => jsonResponse({ ...SOUP, ingredients: [], steps: [] }))
    const { wrapper } = await mountAt('/recepten/5')

    expect(wrapper.text()).toContain('Lekker.')
    expect(wrapper.find('.ingredients').exists()).toBe(false)
    expect(wrapper.find('.steps').exists()).toBe(false)
  })

  describe('porties en boodschappenlijst', () => {
    const PANCAKES = {
      id: 7,
      title: 'Pannenkoeken',
      description: null,
      servings: 4,
      ingredients: [
        { id: 1, name: 'bloem', quantity: 250, unit: 'g', optional: false },
        { id: 2, name: 'ei', quantity: 1, unit: 'stuks', optional: false },
        { id: 3, name: 'melk', quantity: 500, unit: 'ml', optional: false },
        { id: 4, name: 'zout', quantity: null, unit: null, optional: false },
      ],
      steps: [],
    }

    function lines(wrapper) {
      return wrapper.findAll('.ingredients .line').map((l) => l.text())
    }

    function button(wrapper, label) {
      return wrapper.find(`button[aria-label="${label}"]`)
    }

    function buttonWithText(wrapper, text) {
      return wrapper.findAll('button').find((b) => b.text().startsWith(text))
    }

    async function clickTimes(wrapper, label, times) {
      for (let i = 0; i < times; i++) await button(wrapper, label).trigger('click')
    }

    // Het recept, plus een nep-boodschappenlijst op de "server".
    let shoppingDb
    let shoppingFetch

    function serve(recipe) {
      ;({ shoppingDb, fetch: shoppingFetch } = fakeServer())
      mockFetch((method, url, options) =>
        url.startsWith('/api/recipes/') ? jsonResponse(recipe) : shoppingFetch(url, options),
      )
    }

    function shoppingPosts() {
      return shoppingFetch.mock.calls.filter(([, o]) => o.method === 'POST')
    }

    async function mountPancakes() {
      serve(PANCAKES)
      return (await mountAt('/recepten/7')).wrapper
    }

    afterEach(() => {
      vi.useRealTimers()
    })

    it('begint bij de porties van het recept, zonder "terug naar origineel"', async () => {
      const wrapper = await mountPancakes()

      expect(wrapper.find('.servings-count').text()).toBe('4 porties')
      expect(buttonWithText(wrapper, 'Terug naar origineel')).toBeUndefined()
      expect(lines(wrapper)).toEqual([
        '250 g bloem',
        '1 stuks ei',
        '500 ml melk',
        'zout — naar smaak',
      ])
    })

    it('schaalt alle hoeveelheden mee, behalve "naar smaak"', async () => {
      const wrapper = await mountPancakes()

      await clickTimes(wrapper, 'Meer porties', 2)

      expect(wrapper.find('.servings-count').text()).toBe('6 porties')
      expect(lines(wrapper)).toEqual([
        '375 g bloem',
        '1,5 stuks ei',
        '750 ml melk',
        'zout — naar smaak',
      ])
    })

    it('schaalt terug naar 1 portie zonder 0 stuks', async () => {
      const wrapper = await mountPancakes()

      await clickTimes(wrapper, 'Minder porties', 3)

      expect(wrapper.find('.servings-count').text()).toBe('1 portie')
      expect(lines(wrapper)[1]).toBe('0,5 stuks ei')
      expect(button(wrapper, 'Minder porties').attributes('disabled')).toBeDefined()

      await button(wrapper, 'Minder porties').trigger('click')
      expect(wrapper.find('.servings-count').text()).toBe('1 portie')
    })

    it('gaat niet boven 50 porties', async () => {
      const wrapper = await mountPancakes()

      await clickTimes(wrapper, 'Meer porties', 50)

      expect(wrapper.find('.servings-count').text()).toBe('50 porties')
      expect(button(wrapper, 'Meer porties').attributes('disabled')).toBeDefined()
      expect(lines(wrapper)[0]).toBe('3.125 g bloem')
    })

    it('zet met "terug naar origineel" de porties terug', async () => {
      const wrapper = await mountPancakes()
      await clickTimes(wrapper, 'Meer porties', 1)

      await buttonWithText(wrapper, 'Terug naar origineel').trigger('click')

      expect(wrapper.find('.servings-count').text()).toBe('4 porties')
      expect(buttonWithText(wrapper, 'Terug naar origineel')).toBeUndefined()
    })

    it('zet één ingrediënt geschaald op de lijst, met een korte bevestiging', async () => {
      vi.useFakeTimers()
      const wrapper = await mountPancakes()
      await clickTimes(wrapper, 'Meer porties', 2)

      await button(wrapper, 'bloem op boodschappenlijst').trigger('click')
      await flushPromises()

      expect(shoppingDb).toHaveLength(1)
      expect(shoppingDb[0]).toMatchObject({
        name: 'bloem',
        quantity: 375,
        unit: 'g',
        source_label: 'Pannenkoeken',
        recipe_id: 7,
      })
      expect(wrapper.find('[role="status"]').text()).toBe('bloem staat op je boodschappenlijst.')

      await vi.advanceTimersByTimeAsync(3000)
      expect(wrapper.find('[role="status"]').exists()).toBe(false)
    })

    it('zet met "Alles op lijst" alle geschaalde ingrediënten op de lijst', async () => {
      const wrapper = await mountPancakes()
      await clickTimes(wrapper, 'Minder porties', 2)

      await buttonWithText(wrapper, 'Alles op lijst').trigger('click')
      await flushPromises()

      // Eén request voor het hele recept.
      expect(shoppingPosts()).toHaveLength(1)
      expect(shoppingDb.map((i) => [i.name, i.quantity, i.unit])).toEqual([
        ['bloem', 125, 'g'],
        ['ei', 0.5, 'stuks'],
        ['melk', 250, 'ml'],
        ['zout', null, null],
      ])
      expect(wrapper.find('[role="status"]').text()).toContain('Alle ingrediënten')
    })

    it('toont een melding als de lijst op de server niet bijgewerkt kan worden', async () => {
      const wrapper = await mountPancakes()
      mockFetch(() => jsonResponse({ error: 'Too many requests' }, 429))

      await buttonWithText(wrapper, 'Alles op lijst').trigger('click')
      await flushPromises()

      expect(wrapper.find('[role="alert"]').text()).toBe(
        'Te veel verzoeken. Probeer het later opnieuw.',
      )
      expect(wrapper.find('[role="status"]').exists()).toBe(false)
    })

    describe('met een optioneel ingrediënt', () => {
      const WITH_OPTIONAL = {
        ...PANCAKES,
        ingredients: [
          ...PANCAKES.ingredients,
          { id: 5, name: 'poedersuiker', quantity: 20, unit: 'g', optional: true },
        ],
      }

      async function mountWithOptional() {
        serve(WITH_OPTIONAL)
        return (await mountAt('/recepten/7')).wrapper
      }

      it('toont "(optioneel)" achter de naam, in muted kleur', async () => {
        const wrapper = await mountWithOptional()

        expect(lines(wrapper).at(-1)).toBe('20 g poedersuiker (optioneel)')
        const label = wrapper.findAll('.ingredients .line').at(-1).find('.optional')
        expect(label.text()).toBe('(optioneel)')
        expect(label.classes()).toContain('muted')
        // Alleen bij het optionele ingrediënt.
        expect(wrapper.findAll('.ingredients .optional')).toHaveLength(1)
      })

      it('"Alles op lijst" slaat optionele ingrediënten over', async () => {
        const wrapper = await mountWithOptional()

        await buttonWithText(wrapper, 'Alles op lijst').trigger('click')
        await flushPromises()

        expect(shoppingDb.map((i) => i.name)).toEqual(['bloem', 'ei', 'melk', 'zout'])
        expect(wrapper.find('[role="status"]').text()).toBe(
          'Alle ingrediënten staan op je boodschappenlijst, behalve de optionele.',
        )
      })

      it('"+ lijst" werkt ook voor een optioneel ingrediënt', async () => {
        const wrapper = await mountWithOptional()

        await button(wrapper, 'poedersuiker op boodschappenlijst').trigger('click')
        await flushPromises()

        expect(shoppingDb.map((i) => [i.name, i.quantity, i.unit])).toEqual([
          ['poedersuiker', 20, 'g'],
        ])
      })
    })
  })
})
