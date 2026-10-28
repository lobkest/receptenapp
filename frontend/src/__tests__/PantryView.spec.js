import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { jsonResponse, mockFetch } from './helpers'
import { mountRoute } from './mount'

const LUNCH = { id: 2, name: 'Lunch', position: 2 }

// Een nep-server zoals Rails: de voorraad, en per recept wat ontbreekt (met alternatieven
// en optionele regels zoals PantryMatcher). Tags filteren zoals /api/recipes.
function fakeServer() {
  const ingredients = [
    { id: 1, name: 'zout', staple: true },
    { id: 2, name: 'olijfolie', staple: true },
    { id: 3, name: 'paprika', staple: false },
    { id: 4, name: 'feta', staple: false },
    { id: 5, name: 'pasta', staple: false },
    { id: 6, name: 'kip', staple: false },
  ]
  const rows = {} // ingredient id → present, alleen afwijkingen
  const recipes = [
    {
      id: 10,
      title: 'Pasta met feta',
      servings: 2,
      category: LUNCH,
      tags: ['vegetarisch'],
      rows: [
        [11, 5],
        [12, 4],
        [13, 2],
      ],
    },
    {
      id: 20,
      title: 'Paprikasalade',
      servings: 4,
      category: null,
      tags: ['vegetarisch'],
      rows: [
        [21, 3],
        [22, 4],
        [23, 1],
      ],
    },
    {
      id: 30,
      title: 'Kip met paprika',
      servings: 4,
      category: null,
      tags: [],
      rows: [
        [31, 6],
        [32, 3],
        [33, 5],
      ],
    },
  ]
  const present = (ingredient) => rows[ingredient.id] ?? ingredient.staple
  const byId = (id) => ingredients.find((ingredient) => ingredient.id === id)
  const pantry = () => ({
    in_house: ingredients
      .filter((i) => !i.staple && present(i))
      .map(({ id, name }) => ({ id, name })),
    staples: ingredients
      .filter((i) => i.staple)
      .map((i) => ({ id: i.id, name: i.name, present: present(i) })),
    suggestions: ingredients
      .filter((i) => !i.staple && !present(i))
      .map(({ id, name }) => ({ id, name })),
  })

  const added = []
  const fetch = mockFetch((method, url, options) => {
    const [path, query = ''] = url.split('?')
    const body = options.body ? JSON.parse(options.body) : {}
    if (path === '/api/tags')
      return jsonResponse([{ name: 'vegetarisch', count: 2, automatic: true }])
    if (path === '/api/categories') return jsonResponse([LUNCH])
    if (path === '/api/ingredients') return jsonResponse(ingredients)
    if (path === '/api/pantry' && method === 'GET') return jsonResponse(pantry())
    if (path === '/api/pantry/reset') {
      for (const key of Object.keys(rows)) delete rows[key]
      return jsonResponse(pantry())
    }
    const match = path.match(/^\/api\/pantry\/ingredients\/(\d+)$/)
    if (match && method === 'PATCH') {
      const ingredient = byId(Number(match[1]))
      if (body.pantry_item.present === ingredient.staple) delete rows[ingredient.id]
      else rows[ingredient.id] = body.pantry_item.present
      return jsonResponse(pantry())
    }
    if (path === '/api/pantry/recipes') {
      const tags = new URLSearchParams(query).get('tags')?.split(',') ?? []
      const results = recipes
        .filter((recipe) => tags.every((tag) => recipe.tags.includes(tag)))
        .map((recipe) => ({
          id: recipe.id,
          title: recipe.title,
          servings: recipe.servings,
          category: recipe.category,
          missing: recipe.rows
            .filter(([, id]) => !present(byId(id)))
            .map(([rowId, id]) => ({ id: rowId, name: byId(id).name })),
        }))
      return jsonResponse(
        [0, 1, 2].map((count) => ({
          missing_count: count,
          recipes: results.filter((result) => result.missing.length === count),
        })),
      )
    }
    const add = path.match(/^\/api\/recipes\/(\d+)\/add_to_shopping_list$/)
    if (add) {
      added.push({ recipe: Number(add[1]), ...body })
      return jsonResponse(
        body.ingredient_ids.map((id, index) => ({
          id: 100 + index,
          name: `regel ${id}`,
          checked: false,
        })),
        201,
      )
    }
    throw new Error(`Onverwachte request: ${method} ${url}`)
  })
  return { fetch, rows, added }
}

async function mountAt(path = '/in-huis') {
  return mountRoute(path, { attach: true, freshPinia: false })
}

// [[titel van de sectie, [recept, mist]]]
function sections(wrapper) {
  return wrapper
    .findAll('.match-group')
    .map((section) => [
      section.find('.group-title').text(),
      section
        .findAll('.match')
        .map((match) => [
          match.find('.match-title').text(),
          match.find('.missing').exists() ? match.find('.missing').text() : null,
        ]),
    ])
}

const chipTexts = (wrapper, selector) =>
  wrapper.findAll(`${selector} li`).map((chip) => chip.text().replace(/\s+/g, ' '))

describe('PantryView', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('lege staat: een korte uitleg, en de recepten in secties Mist 1 en Mist 2', async () => {
    fakeServer()
    const { wrapper } = await mountAt()

    expect(wrapper.find('h1').text()).toBe('In huis')
    expect(wrapper.find('.intro').text()).toContain('Zet hieronder wat je in huis hebt')
    expect(sections(wrapper)).toEqual([
      [
        'Mist 2',
        [
          ['Pasta met feta', 'mist: pasta, feta'],
          ['Paprikasalade', 'mist: paprika, feta'],
        ],
      ],
    ])
    expect(wrapper.find('.reset').exists()).toBe(false)
  })

  it('toont tijdens het laden alleen een laadregel: geen chips en geen voorraad-invoer', async () => {
    let answer
    mockFetch(() => new Promise((resolve) => (answer = resolve)))
    const { wrapper } = await mountAt()

    expect(wrapper.find('.muted').text()).toBe('In huis laden…')
    expect(wrapper.find('.filter-chip').exists()).toBe(false)
    expect(wrapper.find('input').exists()).toBe(false)
    expect(wrapper.find('.intro').exists()).toBe(false)
    answer(jsonResponse({}, 404))
    await flushPromises()
  })

  it('een serverfout bij het laden: geen eigen foutblok of knop, wel een melding', async () => {
    const fetch = mockFetch(() => jsonResponse({}, 500))
    const { wrapper } = await mountAt()

    expect(wrapper.find('.muted').text()).toBe('Er ging iets mis op de server.')
    expect(wrapper.find('.notice-error').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Opnieuw proberen')
    expect(wrapper.find('.filter-chip').exists()).toBe(false)
    // De serverstatus kijkt opnieuw (/up), zodat de gedeelde melding het kan overnemen.
    expect(fetch.mock.calls.some(([url]) => url === '/up')).toBe(true)
  })

  it('in huis zetten via de snelkeuze verschuift recepten naar "Alles in huis"', async () => {
    fakeServer()
    const { wrapper } = await mountAt()

    const quick = () => wrapper.findAll('.quick-picks button')
    await quick()
      .find((b) => b.text() === '+ feta')
      .trigger('click')
    await flushPromises()
    await quick()
      .find((b) => b.text() === '+ paprika')
      .trigger('click')
    await flushPromises()

    expect(chipTexts(wrapper, '.in-house')).toEqual(['paprika ×', 'feta ×'])
    expect(chipTexts(wrapper, '.quick-picks')).toEqual(['+ pasta', '+ kip'])
    expect(sections(wrapper)).toEqual([
      ['Alles in huis', [['Paprikasalade', null]]],
      ['Mist 1', [['Pasta met feta', 'mist: pasta']]],
      ['Mist 2', [['Kip met paprika', 'mist: kip, pasta']]],
    ])
    // Een recept zonder iets te missen heeft geen knop.
    expect(wrapper.findAll('.match-group')[0].find('.add-missing').exists()).toBe(false)
    expect(wrapper.findAll('.match-group')[1].find('.add-missing').text()).toBe(
      'Ontbrekende op lijst',
    )
    expect(wrapper.find('.intro').exists()).toBe(false)

    // × haalt het weer weg.
    await wrapper.find('.in-house [aria-label="feta weghalen"]').trigger('click')
    await flushPromises()
    expect(chipTexts(wrapper, '.in-house')).toEqual(['paprika ×'])
  })

  it('zoeken met de bestaande ingrediënten; Enter zet de eerste in huis', async () => {
    const { rows } = fakeServer()
    const { wrapper } = await mountAt()

    const input = wrapper.find('#pantry-search')
    await input.setValue('pa')
    expect(chipTexts(wrapper, '.matches-found')).toEqual(['+ paprika', '+ pasta'])
    await input.setValue('pasta')
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()

    expect(rows).toEqual({ 5: true })
    expect(input.element.value).toBe('')
    // Een typfout: "Bedoel je: …?" uit de bestaande namen.
    await input.setValue('papirka')
    expect(wrapper.find('.ingredient-suggestion').text()).toContain('paprika')
  })

  it('Basis: ingeklapt, op is doorgestreept met ↺, en terug naar standaard met bevestiging', async () => {
    const { rows } = fakeServer()
    const { wrapper } = await mountAt()

    const details = wrapper.find('details.staples')
    expect(details.attributes('open')).toBeUndefined()
    expect(details.find('summary').text().replace(/\s+/g, ' ')).toBe('Basis (2)')

    await wrapper.find('[aria-label="olijfolie is op"]').trigger('click')
    await flushPromises()
    expect(rows).toEqual({ 2: false })
    const out = wrapper.find('[aria-label="olijfolie weer in huis"]')
    expect(out.classes()).toContain('out')
    expect(out.text()).toContain('↺')
    expect(wrapper.find('details.staples summary').text().replace(/\s+/g, ' ')).toBe(
      'Basis (2, 1 op)',
    )
    expect(sections(wrapper).map(([title]) => title)).toEqual(['Mist 2'])

    // Annuleren doet niets; bevestigen wist alles.
    await wrapper.find('.reset').trigger('click')
    await flushPromises()
    document.querySelector('.confirm-dialog .cancel').click()
    await flushPromises()
    expect(rows).toEqual({ 2: false })

    await wrapper.find('.reset').trigger('click')
    await flushPromises()
    expect(document.querySelector('.confirm-dialog h2').textContent).toBe('Terug naar standaard?')
    document.querySelector('.confirm-dialog .confirm').click()
    await flushPromises()
    expect(rows).toEqual({})
    expect(wrapper.find('[aria-label="olijfolie is op"]').exists()).toBe(true)
  })

  it("Ontbrekende op lijst: de ontbrekende regel-id's met de porties van het recept", async () => {
    const { added } = fakeServer()
    const { wrapper } = await mountAt()

    const salad = wrapper.findAll('.match').find((match) => match.text().includes('Paprikasalade'))
    await salad.find('.add-missing').trigger('click')
    await flushPromises()

    expect(added).toEqual([{ recipe: 20, servings: 4, ingredient_ids: [21, 22] }])
    expect(salad.find('.added').text()).toBe('Op de lijst ✓')
    expect(salad.find('.add-missing').exists()).toBe(false)
  })

  it('filtert met de gedeelde chips: tags via de server, categorie in de browser', async () => {
    const { fetch } = fakeServer()
    const { wrapper, router } = await mountAt('/in-huis?category=2')

    expect(sections(wrapper)).toEqual([['Mist 2', [['Pasta met feta', 'mist: pasta, feta']]]])
    const chip = wrapper.findAll('.tag-chips .filter-chip')[0]
    await chip.trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.query).toEqual({ category: '2', tags: 'vegetarisch' })
    expect(fetch.mock.calls.map(([url]) => url)).toContain('/api/pantry/recipes?tags=vegetarisch')
  })
})
