import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import { routes } from '../router'
import { useShoppingListStore } from '../stores/shoppingList'
import { jsonResponse, mockFetch } from './helpers'

const SOUP = { id: 5, title: 'Tomatensoep', description: 'Lekker.', servings: 4 }

async function mountAt(path) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push(path)
  const wrapper = mount(RouterView, { global: { plugins: [pinia, router] } })
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

  it('toont geen beheerknoppen voor gewone bezoekers', async () => {
    mockFetch(() => jsonResponse(SOUP))
    const { wrapper } = await mountAt('/recepten/5')

    expect(wrapper.text()).toContain('Tomatensoep')
    expect(wrapper.find('.admin-actions').exists()).toBe(false)
  })

  it('toont Bewerken en Verwijderen als je ingelogd bent', async () => {
    sessionStorage.setItem('adminCode', 'geheim')
    mockFetch(() => jsonResponse(SOUP))
    const { wrapper } = await mountAt('/recepten/5')

    const actions = wrapper.find('.admin-actions')
    expect(actions.find('a').attributes('href')).toBe('/beheer/recepten/5/bewerken')
    expect(actions.find('button').text()).toBe('Verwijderen')
  })

  it('verwijdert na bevestiging en gaat naar beheer', async () => {
    sessionStorage.setItem('adminCode', 'geheim')
    const fetch = mockFetch((method, url) => {
      if (method === 'DELETE') return new Response(null, { status: 204 })
      return jsonResponse(url === '/api/recipes/5' ? SOUP : [])
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { wrapper, router } = await mountAt('/recepten/5')

    await wrapper.find('.admin-actions button').trigger('click')
    await flushPromises()

    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/recipes/5',
      expect.objectContaining({ method: 'DELETE' }),
    )
    expect(router.currentRoute.value.name).toBe('admin')
    expect(wrapper.find('[role="status"]').text()).toBe('"Tomatensoep" is verwijderd.')
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

    async function mountPancakes() {
      mockFetch(() => jsonResponse(PANCAKES))
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

      const list = useShoppingListStore()
      expect(list.items).toHaveLength(1)
      expect(list.items[0]).toMatchObject({ name: 'bloem', quantity: 375, unit: 'g' })
      expect(list.items[0].sources).toEqual([{ id: 7, title: 'Pannenkoeken' }])
      expect(wrapper.find('[role="status"]').text()).toBe('bloem staat op je boodschappenlijst.')

      await vi.advanceTimersByTimeAsync(3000)
      expect(wrapper.find('[role="status"]').exists()).toBe(false)
    })

    it('zet met "Alles op lijst" alle geschaalde ingrediënten op de lijst', async () => {
      const wrapper = await mountPancakes()
      await clickTimes(wrapper, 'Minder porties', 2)

      await buttonWithText(wrapper, 'Alles op lijst').trigger('click')

      const list = useShoppingListStore()
      expect(list.items.map((i) => [i.name, i.quantity, i.unit])).toEqual([
        ['bloem', 125, 'g'],
        ['ei', 0.5, 'stuks'],
        ['melk', 250, 'ml'],
        ['zout', null, null],
      ])
      expect(wrapper.find('[role="status"]').text()).toContain('Alle ingrediënten')
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
        mockFetch(() => jsonResponse(WITH_OPTIONAL))
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

        const list = useShoppingListStore()
        expect(list.items.map((i) => i.name)).toEqual(['bloem', 'ei', 'melk', 'zout'])
        expect(wrapper.find('[role="status"]').text()).toBe(
          'Alle ingrediënten staan op je boodschappenlijst, behalve de optionele.',
        )
      })

      it('"+ lijst" werkt ook voor een optioneel ingrediënt', async () => {
        const wrapper = await mountWithOptional()

        await button(wrapper, 'poedersuiker op boodschappenlijst').trigger('click')

        const list = useShoppingListStore()
        expect(list.items.map((i) => [i.name, i.quantity, i.unit])).toEqual([
          ['poedersuiker', 20, 'g'],
        ])
      })
    })
  })
})
