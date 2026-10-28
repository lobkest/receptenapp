import { describe, it, expect, vi, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { jsonResponse, mockFetch } from './helpers'
import { mountRoute } from './mount'

const INGREDIENTS = [
  {
    id: 1,
    name: 'bloem',
    nevo_food: { code: 220, name: 'Tarwebloem' },
    label_values: false,
    needs_review: true,
  },
  {
    id: 2,
    name: 'ei',
    nevo_food: { code: 83, name: 'Kippeneieren rauw' },
    label_values: false,
    needs_review: false,
  },
  { id: 3, name: 'pokesaus', nevo_food: null, label_values: false, needs_review: false },
  { id: 4, name: 'boter', nevo_food: null, label_values: true, needs_review: false },
]

async function mountAt(path) {
  return mountRoute(path)
}

const names = (wrapper) => wrapper.findAll('.ingredient-list .name').map((n) => n.text())

describe('IngredientsView', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('toont alle ingrediënten met hun NEVO-product en badges', async () => {
    mockFetch(() => jsonResponse(INGREDIENTS))
    const { wrapper } = await mountAt('/ingredienten')

    expect(names(wrapper)).toEqual(['bloem', 'ei', 'pokesaus', 'boter'])
    const items = wrapper.findAll('.ingredient-list li')
    expect(items[0].find('.nevo').text()).toBe('Tarwebloem')
    expect(items[0].find('.badge.review').text()).toBe('te controleren')
    expect(items[2].find('.nevo').text()).toBe('Niet gekoppeld')
    expect(items[3].find('.badge').text()).toBe('etiket')
    expect(items[1].find('a').attributes('href')).toBe('/ingredienten/2')
  })

  it('filtert op nog niet gekoppeld en te controleren, met aantallen, en bewaart dat in de URL', async () => {
    mockFetch(() => jsonResponse(INGREDIENTS))
    const { wrapper, router } = await mountAt('/ingredienten')
    const chips = wrapper.findAll('.filter-chip')
    expect(chips.map((c) => c.text())).toEqual([
      'Alle 4',
      'Nog niet gekoppeld 1',
      'Te controleren 1',
      'Kenmerken te controleren 4',
      'Basis 0',
    ])

    await chips[1].trigger('click')
    await flushPromises()
    expect(names(wrapper)).toEqual(['pokesaus'])
    expect(router.currentRoute.value.query).toEqual({ filter: 'ongekoppeld' })

    await chips[2].trigger('click')
    expect(names(wrapper)).toEqual(['bloem'])
  })

  it('verwaarloosbaar: een badge, en niet bij "nog niet gekoppeld"', async () => {
    const list = [
      ...INGREDIENTS,
      {
        id: 9,
        name: 'bakpoeder',
        nevo_food: null,
        label_values: false,
        needs_review: false,
        negligible: true,
      },
    ]
    mockFetch(() => jsonResponse(list))
    const { wrapper } = await mountAt('/ingredienten?filter=ongekoppeld')

    expect(names(wrapper)).toEqual(['pokesaus'])
    await wrapper.findAll('.filter-chip')[0].trigger('click')
    const bakpoeder = wrapper
      .findAll('.ingredient-list li')
      .find((li) => li.text().includes('bakpoeder'))
    expect(bakpoeder.find('.badge').text()).toBe('verwaarloosbaar')
  })

  it('basis: een badge en een eigen filter, naast de kenmerken en verwaarloosbaar', async () => {
    const list = INGREDIENTS.map((ingredient) =>
      ingredient.name === 'bloem' ? { ...ingredient, staple: true } : ingredient,
    )
    mockFetch(() => jsonResponse(list))
    const { wrapper, router } = await mountAt('/ingredienten')

    const chip = wrapper.findAll('.filter-chip').find((c) => c.text().startsWith('Basis'))
    expect(chip.text()).toBe('Basis 1')
    expect(wrapper.findAll('.filter-chip').map((c) => c.text().split(' ')[0])).toEqual([
      'Alle',
      'Nog',
      'Te',
      'Kenmerken',
      'Basis',
    ])
    await chip.trigger('click')
    await flushPromises()
    expect(names(wrapper)).toEqual(['bloem'])
    expect(router.currentRoute.value.query).toEqual({ filter: 'basis' })
    expect(wrapper.find('.ingredient-list .badge:not(.review)').text()).toBe('basis')
  })

  it('toont de kenmerken per rij en filtert op kenmerken te controleren', async () => {
    const list = INGREDIENTS.map((ingredient) => ({
      ...ingredient,
      traits:
        ingredient.name === 'ei' ? ['dierlijk'] : ingredient.name === 'bloem' ? ['gluten'] : [],
      traits_checked: ingredient.name !== 'ei' && ingredient.name !== 'pokesaus',
    }))
    mockFetch(() => jsonResponse(list))
    const { wrapper, router } = await mountAt('/ingredienten')

    const row = (name) =>
      wrapper.findAll('.ingredient-list li').find((li) => li.find('.name').text() === name)
    expect(
      row('bloem')
        .findAll('.trait')
        .map((t) => t.text()),
    ).toEqual(['gluten'])
    expect(
      row('ei')
        .findAll('.trait')
        .map((t) => t.text()),
    ).toEqual(['dierlijk', 'kenmerken controleren'])
    // Gecontroleerd en zonder kenmerken: geen lege regel.
    expect(row('boter').find('.traits').exists()).toBe(false)

    const chip = wrapper.findAll('.filter-chip').find((c) => c.text().startsWith('Kenmerken'))
    expect(chip.text()).toBe('Kenmerken te controleren 2')
    await chip.trigger('click')
    await flushPromises()
    expect(names(wrapper)).toEqual(['ei', 'pokesaus'])
    expect(router.currentRoute.value.query).toEqual({ filter: 'kenmerken' })
  })

  it('✓ zet traits_checked; de rij verdwijnt uit "Kenmerken te controleren" zonder herladen', async () => {
    const list = INGREDIENTS.map((ingredient) => ({
      ...ingredient,
      traits: [],
      traits_checked: ingredient.name === 'boter',
    }))
    const fetch = mockFetch((method, url) => {
      if (url === '/api/ingredients' && method === 'GET') return jsonResponse(list)
      if (url === '/api/ingredients/2/traits' && method === 'PATCH')
        return jsonResponse({ ...list[1], traits_checked: true })
      throw new Error(`Onverwacht: ${method} ${url}`)
    })
    const { wrapper } = await mountAt('/ingredienten?filter=kenmerken')

    expect(names(wrapper)).toEqual(['bloem', 'ei', 'pokesaus'])
    // Alleen bij wat nog te controleren is, met een duidelijke naam voor schermlezers.
    const buttons = wrapper.findAll('button.mark-checked')
    expect(buttons.map((b) => b.attributes('aria-label'))).toEqual([
      'bloem gecontroleerd',
      'ei gecontroleerd',
      'pokesaus gecontroleerd',
    ])

    await buttons[1].trigger('click')
    await flushPromises()

    const call = fetch.mock.calls.find((c) => c[1]?.method === 'PATCH')
    expect(call[0]).toBe('/api/ingredients/2/traits')
    expect(JSON.parse(call[1].body)).toEqual({ ingredient: { traits_checked: true } })
    expect(names(wrapper)).toEqual(['bloem', 'pokesaus'])
    expect(fetch.mock.calls.filter((c) => c[0] === '/api/ingredients')).toHaveLength(1)
    const chip = wrapper.findAll('.filter-chip').find((c) => c.text().startsWith('Kenmerken'))
    expect(chip.text()).toBe('Kenmerken te controleren 2')
  })

  it('✓ bij een fout: melding, en de rij blijft staan', async () => {
    const list = INGREDIENTS.map((ingredient) => ({
      ...ingredient,
      traits: [],
      traits_checked: false,
    }))
    mockFetch((method) => {
      if (method === 'GET') return jsonResponse(list)
      return jsonResponse({ error: 'Te veel verzoeken.', errors: {} }, 429)
    })
    const { wrapper } = await mountAt('/ingredienten?filter=kenmerken')

    await wrapper.find('button.mark-checked').trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(names(wrapper)).toEqual(['bloem', 'ei', 'pokesaus', 'boter'])
  })

  it('zoekt op de naam van het ingrediënt en van het NEVO-product', async () => {
    mockFetch(() => jsonResponse(INGREDIENTS))
    const { wrapper } = await mountAt('/ingredienten?zoek=kippen')

    expect(wrapper.find('#ingredient-search').element.value).toBe('kippen')
    expect(names(wrapper)).toEqual(['ei'])

    await wrapper.find('#ingredient-search').setValue('xyz')
    expect(wrapper.find('.empty').text()).toBe('Geen ingrediënten gevonden.')
  })
})
