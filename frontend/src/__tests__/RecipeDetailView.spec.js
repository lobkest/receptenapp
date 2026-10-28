import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { useShoppingListStore } from '../stores/shoppingList'
import { jsonResponse, mockFetch as mockServer } from './helpers'
import { mountRoute } from './mount'

// De receptpagina haalt bij openen ook de boodschappenlijst op (voor "✓ op lijst"). Die is
// hier leeg, tenzij een test hem zelf beantwoordt.
function mockFetch(handler) {
  return mockServer((method, url, options) =>
    method === 'GET' && url === '/api/shopping_list_items'
      ? jsonResponse([])
      : handler(method, url, options),
  )
}

const SOUP = { id: 5, title: 'Tomatensoep', description: 'Lekker.', servings: 4 }

// attach: aan het document hangen, nodig om te kunnen controleren waar de focus staat.
async function mountAt(path, { attach = false } = {}) {
  return mountRoute(path, { attach })
}

describe('RecipeDetailView', () => {
  beforeEach(() => {
    sessionStorage.clear()
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

  it('maakt links in de beschrijving klikbaar, in een nieuw tabblad', async () => {
    mockFetch(() =>
      jsonResponse({ ...SOUP, description: 'Van https://example.com/soep.\nLekker.' }),
    )
    const { wrapper } = await mountAt('/recepten/5')

    const description = wrapper.find('.description')
    expect(description.text()).toBe('Van https://example.com/soep.\nLekker.')
    const link = description.find('a')
    expect(link.attributes('href')).toBe('https://example.com/soep')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toBe('noopener noreferrer')
    expect(link.text()).toBe('https://example.com/soep')
  })

  it('maakt geen HTML van een beschrijving met tags', async () => {
    mockFetch(() => jsonResponse({ ...SOUP, description: '<b>vet</b> <a href="x">nep</a>' }))
    const { wrapper } = await mountAt('/recepten/5')

    expect(wrapper.find('.description b').exists()).toBe(false)
    expect(wrapper.find('.description a').exists()).toBe(false)
    expect(wrapper.find('.description').text()).toBe('<b>vet</b> <a href="x">nep</a>')
  })

  describe('automatische tags', () => {
    const WOK = {
      ...SOUP,
      tags: ['snel'],
      ingredients: [
        {
          id: 12,
          name: 'kip',
          quantity: 200,
          unit: 'g',
          optional: false,
          alternatives: [
            {
              id: 3,
              name: 'tofu',
              quantity: null,
              unit: null,
              effective_quantity: 200,
              effective_unit: 'g',
            },
          ],
        },
      ],
      automatic_tags: [
        { name: 'glutenvrij', status: 'ja', disclaimer: true, swaps: [], without: [] },
        {
          name: 'vegetarisch',
          status: 'met_wissel',
          disclaimer: false,
          swaps: [
            {
              recipe_ingredient_id: 12,
              ingredient: 'kip',
              alternatives: [{ id: 3, name: 'tofu' }],
            },
          ],
          without: [],
        },
      ],
    }
    const tagTexts = (wrapper) => wrapper.findAll('.recipe-tags .tag').map((tag) => tag.text())

    it('toont de hint "met tofu i.p.v. kip" en de disclaimer bij glutenvrij', async () => {
      mockFetch(() => jsonResponse(WOK))
      const { wrapper } = await mountAt('/recepten/5')

      expect(tagTexts(wrapper)).toEqual(['glutenvrij', 'vegetarisch · met tofu i.p.v. kip', 'snel'])
      expect(wrapper.find('.tag-disclaimer').text()).toBe(
        'Op basis van eigen ingrediëntgegevens; controleer etiketten.',
      )
    })

    it('de hint verdwijnt als de wissel actief is in de URL', async () => {
      mockFetch(() => jsonResponse(WOK))
      const { wrapper } = await mountAt('/recepten/5?wissel=12:3')

      expect(tagTexts(wrapper)).toEqual(['glutenvrij', 'vegetarisch', 'snel'])
    })

    it('en verdwijnt ook als je op de pagina wisselt', async () => {
      mockFetch(() => jsonResponse(WOK))
      const { wrapper, router } = await mountAt('/recepten/5')
      await wrapper.find('button[aria-label="Wissel voor tofu"]').trigger('click')
      await flushPromises()

      expect(router.currentRoute.value.query.wissel).toBe('12:3')
      expect(tagTexts(wrapper)).toEqual(['glutenvrij', 'vegetarisch', 'snel'])
    })

    it('zonder glutenvrij of lactosevrij geen disclaimer', async () => {
      mockFetch(() => jsonResponse({ ...WOK, automatic_tags: WOK.automatic_tags.slice(1) }))
      const { wrapper } = await mountAt('/recepten/5')

      expect(wrapper.find('.tag-disclaimer').exists()).toBe(false)
    })
  })

  it('toont de categorie klein boven de titel, en niets zonder categorie', async () => {
    mockFetch(() => jsonResponse({ ...SOUP, category: { id: 3, name: 'Diner', position: 3 } }))
    const { wrapper } = await mountAt('/recepten/5')
    expect(wrapper.find('.category-label').text()).toBe('Diner')

    mockFetch(() => jsonResponse({ ...SOUP, category: null }))
    const { wrapper: without } = await mountAt('/recepten/5')
    expect(without.find('.category-label').exists()).toBe(false)
  })

  it('toont de voedingswaarde onderaan alleen als er minstens één ingrediënt meetelt', async () => {
    const nutrition = {
      servings: 4,
      counted: 1,
      total: {},
      per_serving: { kcal: 250, protein: 9, carbohydrates: 40, fat: 3, fiber: 2 },
      not_counted: [{ name: 'zout', reason: 'optioneel' }],
      unknown: {},
      label_values: false,
      nevo_versions: ['2025/9.0'],
      lines: [
        {
          id: 1,
          ingredient_id: 1,
          name: 'bloem',
          grams: 250,
          millilitres: null,
          values: { kcal: 1000, protein: 36, carbohydrates: 160, fat: 12, fiber: 8 },
          reason: null,
          source: 'Tarwebloem',
          label: false,
          nevo_version: '2025/9.0',
          alternatives: [],
        },
        {
          id: 2,
          ingredient_id: 2,
          name: 'zout',
          values: null,
          reason: 'optioneel',
          alternatives: [],
        },
      ],
    }
    mockFetch(() => jsonResponse({ ...SOUP, nutrition }))
    const { wrapper } = await mountAt('/recepten/5')
    const block = wrapper.find('details.nutrition')
    expect(block.exists()).toBe(true)
    // Na de stappen en variaties, vlak voor de knoppen.
    expect(block.element.nextElementSibling.classList).toContain('recipe-actions')
    expect(block.find('.not-counted').text()).toContain('1 ingrediënt niet meegeteld')

    mockFetch(() => jsonResponse({ ...SOUP, nutrition: { ...nutrition, counted: 0 } }))
    const { wrapper: none } = await mountAt('/recepten/5')
    expect(none.find('details.nutrition').exists()).toBe(false)
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
      'zout',
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

    // Het recept, plus "op lijst" op de "server". De browser rekent niets meer uit: hij
    // stuurt porties en eventueel welke regels, en toont wat de server teruggeeft.
    const ADD_URL = '/api/recipes/7/add_to_shopping_list'
    let addRequests
    let serverLines

    function serve(recipe) {
      addRequests = []
      serverLines = [{ id: 90, name: 'bloem', quantity: 375, unit: 'g', checked: false }]
      mockFetch((method, url, options) => {
        if (url === ADD_URL && method === 'POST') {
          addRequests.push(JSON.parse(options.body))
          return jsonResponse(serverLines, 201)
        }
        return jsonResponse(recipe)
      })
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
      expect(lines(wrapper)).toEqual(['250 g bloem', '1 stuks ei', '500 ml melk', 'zout'])
    })

    it('schaalt alle hoeveelheden mee, behalve die zonder hoeveelheid', async () => {
      const wrapper = await mountPancakes()

      await clickTimes(wrapper, 'Meer porties', 2)

      expect(wrapper.find('.servings-count').text()).toBe('6 porties')
      expect(lines(wrapper)).toEqual(['375 g bloem', '1,5 stuks ei', '750 ml melk', 'zout'])
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

    it('toont zonder hoeveelheid alleen de naam, ook na schalen (geen "naar smaak", eenheid, 0 of NaN)', async () => {
      serve({
        ...PANCAKES,
        ingredients: [
          { id: 1, name: 'olie', quantity: 1, unit: 'el', optional: false },
          { id: 2, name: 'kaneel', quantity: 0.5, unit: 'tl', optional: false },
          { id: 3, name: 'zout', quantity: null, unit: null, optional: false },
          // Ook als er toch een eenheid zonder hoeveelheid binnenkomt: die blijft weg.
          { id: 4, name: 'peper', quantity: null, unit: 'g', optional: false },
          { id: 5, name: 'suiker', quantity: null, unit: null, optional: true },
        ],
      })
      const wrapper = (await mountAt('/recepten/7')).wrapper

      const bare = ['zout', 'peper', 'suiker (optioneel)']
      expect(lines(wrapper)).toEqual(['1 el olie', '0,5 tl kaneel', ...bare])

      await clickTimes(wrapper, 'Meer porties', 2) // 6 van 4: × 1,5
      expect(lines(wrapper)).toEqual(['1,5 el olie', '0,8 tl kaneel', ...bare])

      await clickTimes(wrapper, 'Minder porties', 5) // 1 van 4
      expect(lines(wrapper)).toEqual(['0,3 el olie', '0,1 tl kaneel', ...bare])

      const text = wrapper.find('.ingredients ul').text()
      for (const unwanted of ['naar smaak', 'NaN', 'undefined', 'null', ' 0 ']) {
        expect(text).not.toContain(unwanted)
      }
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

    it('vraagt de server één ingrediënt op de lijst te zetten, met een korte bevestiging', async () => {
      vi.useFakeTimers()
      const wrapper = await mountPancakes()
      await clickTimes(wrapper, 'Meer porties', 2)

      await button(wrapper, 'bloem op boodschappenlijst').trigger('click')
      await flushPromises()

      expect(addRequests).toEqual([{ servings: 6, ingredient_ids: [1] }])
      // De regels die de server teruggeeft, staan in de store (teller in het menu).
      expect(useShoppingListStore().items).toEqual(serverLines)
      expect(wrapper.find('[role="status"]').text()).toBe('bloem staat op je boodschappenlijst.')

      await vi.advanceTimersByTimeAsync(3000)
      expect(wrapper.find('[role="status"]').exists()).toBe(false)
    })

    it('vraagt met "Alles op lijst" in één request het hele recept, voor de gekozen porties', async () => {
      const wrapper = await mountPancakes()
      await clickTimes(wrapper, 'Minder porties', 2)

      await buttonWithText(wrapper, 'Alles op lijst').trigger('click')
      await flushPromises()

      // Zonder ingredient_ids: de server neemt alles behalve de optionele.
      expect(addRequests).toEqual([{ servings: 2 }])
      expect(wrapper.find('[role="status"]').text()).toContain('Alle ingrediënten')
    })

    it('toont de melding van de server bij een fout in het verzoek (422)', async () => {
      const wrapper = await mountPancakes()
      mockFetch(() =>
        jsonResponse(
          {
            error: 'Porties moet minder dan of gelijk zijn aan 50',
            errors: { servings: ['moet minder dan of gelijk zijn aan 50'] },
          },
          422,
        ),
      )

      await buttonWithText(wrapper, 'Alles op lijst').trigger('click')
      await flushPromises()

      expect(wrapper.find('[role="alert"]').text()).toBe(
        'Porties moet minder dan of gelijk zijn aan 50',
      )
    })

    it('toont een melding als de lijst op de server niet bijgewerkt kan worden', async () => {
      const wrapper = await mountPancakes()
      mockFetch(() =>
        jsonResponse({ error: 'Te veel verzoeken. Probeer het over een minuut opnieuw.' }, 429),
      )

      await buttonWithText(wrapper, 'Alles op lijst').trigger('click')
      await flushPromises()

      expect(wrapper.find('[role="alert"]').text()).toBe(
        'Te veel verzoeken. Probeer het over een minuut opnieuw.',
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

        expect(addRequests).toEqual([{ servings: 4 }])
        expect(wrapper.find('[role="status"]').text()).toBe(
          'Alle ingrediënten staan op je boodschappenlijst, behalve de optionele.',
        )
      })

      it('"+ lijst" werkt ook voor een optioneel ingrediënt', async () => {
        const wrapper = await mountWithOptional()

        await button(wrapper, 'poedersuiker op boodschappenlijst').trigger('click')
        await flushPromises()

        expect(addRequests).toEqual([{ servings: 4, ingredient_ids: [5] }])
      })
    })
  })
})
