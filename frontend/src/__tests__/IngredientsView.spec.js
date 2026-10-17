import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import { routes } from '../router'
import { jsonResponse, mockFetch } from './helpers'

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
  setActivePinia(createPinia())
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push(path)
  const wrapper = mount(RouterView, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
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

  it('toont de kenmerken per rij en filtert op kenmerken te controleren', async () => {
    const list = INGREDIENTS.map((ingredient) => ({
      ...ingredient,
      traits: ingredient.name === 'ei' ? ['dierlijk'] : ingredient.name === 'bloem' ? ['gluten'] : [],
      traits_checked: ingredient.name !== 'ei' && ingredient.name !== 'pokesaus',
    }))
    mockFetch(() => jsonResponse(list))
    const { wrapper, router } = await mountAt('/ingredienten')

    const row = (name) =>
      wrapper.findAll('.ingredient-list li').find((li) => li.find('.name').text() === name)
    expect(row('bloem').findAll('.trait').map((t) => t.text())).toEqual(['gluten'])
    expect(row('ei').findAll('.trait').map((t) => t.text())).toEqual([
      'dierlijk',
      'kenmerken controleren',
    ])
    // Gecontroleerd en zonder kenmerken: geen lege regel.
    expect(row('boter').find('.traits').exists()).toBe(false)

    const chip = wrapper.findAll('.filter-chip').find((c) => c.text().startsWith('Kenmerken'))
    expect(chip.text()).toBe('Kenmerken te controleren 2')
    await chip.trigger('click')
    await flushPromises()
    expect(names(wrapper)).toEqual(['ei', 'pokesaus'])
    expect(router.currentRoute.value.query).toEqual({ filter: 'kenmerken' })
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
