import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { fakeStandardServer, jsonResponse } from './helpers'
import { buttonWithText, mountRoute } from './mount'

// "In huis" op de standaardlijst: het huisje bij elk item (op naam gematcht; zonder
// ingrediënt maakt de eerste tik dat aan), en "Op lijst (n)" in de selectiemodus slaat wat
// in huis is over.

const ITEMS = [
  { id: 1, name: 'melk', category: 'zuivel' },
  { id: 2, name: 'kaas', category: 'zuivel' },
  { id: 3, name: 'brood', category: 'brood' },
  { id: 4, name: 'wc-papier', category: null },
]

// melk en brood zijn bestaande ingrediënten; kaas ook, wc-papier niet. melk is in huis,
// brood is basisvoorraad (aan).
const INGREDIENTS = [
  { id: 10, name: 'melk' },
  { id: 11, name: 'kaas' },
  { id: 12, name: 'brood' },
]

let server
let pantryRequests

function mountWithPantry() {
  server = fakeStandardServer(ITEMS)
  pantryRequests = []
  const present = new Set([10, 12])
  const ingredients = [...INGREDIENTS]
  const pantry = () => ({
    in_house: ingredients.filter((i) => i.id !== 12 && present.has(i.id)),
    staples: [{ id: 12, name: 'brood', present: present.has(12) }],
    suggestions: [],
  })
  const inner = server.fetch
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, options = {}) => {
      if (url === '/api/ingredients') return jsonResponse(INGREDIENTS)
      if (url === '/api/pantry') return jsonResponse(pantry())
      if (url === '/api/pantry/ingredients') {
        const { name, present: on } = JSON.parse(options.body).pantry_item
        pantryRequests.push([name, on])
        let ingredient = ingredients.find((i) => i.name === name)
        if (!ingredient && on) ingredients.push((ingredient = { id: 99, name }))
        if (ingredient && on) present.add(ingredient.id)
        if (ingredient && !on) present.delete(ingredient.id)
        return jsonResponse(pantry())
      }
      const toggle = url.match(/^\/api\/pantry\/ingredients\/(\d+)$/)
      if (toggle) {
        const { present: on } = JSON.parse(options.body).pantry_item
        pantryRequests.push([Number(toggle[1]), on])
        if (on) present.add(Number(toggle[1]))
        else present.delete(Number(toggle[1]))
        return jsonResponse(pantry())
      }
      return inner(url, options)
    }),
  )
}

async function mountApp() {
  const { wrapper } = await mountRoute('/standaard', { app: true, attach: true })
  return wrapper
}

function rowOf(wrapper, name) {
  return wrapper.findAll('.items li').find((li) => li.find('.line').text() === name)
}

function houseOf(wrapper, name) {
  return rowOf(wrapper, name).find('.house-button')
}

describe('In huis op de standaardlijst', () => {
  let wrapper

  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
    mountWithPantry()
  })

  afterEach(() => {
    wrapper?.unmount()
    vi.unstubAllGlobals()
  })

  it('huisje bij elk item, alleen een icoon: in huis, basis, niet in huis, geen ingrediënt', async () => {
    wrapper = await mountApp()

    expect(houseOf(wrapper, 'melk').attributes('aria-pressed')).toBe('true')
    expect(houseOf(wrapper, 'brood').attributes('aria-pressed')).toBe('true')
    expect(houseOf(wrapper, 'kaas').attributes('aria-pressed')).toBe('false')
    expect(houseOf(wrapper, 'wc-papier').attributes('aria-pressed')).toBe('false')
    expect(houseOf(wrapper, 'melk').text()).toBe('')
  })

  it('een tik zet het in de voorraad', async () => {
    wrapper = await mountApp()

    await rowOf(wrapper, 'kaas').find('.house-button').trigger('click')
    await flushPromises()

    expect(pantryRequests).toEqual([[11, true]])
    expect(houseOf(wrapper, 'kaas').attributes('aria-pressed')).toBe('true')
  })

  it('zonder ingrediënt: de eerste tik gaat op naam, daarna op het nieuwe id', async () => {
    wrapper = await mountApp()

    await houseOf(wrapper, 'wc-papier').trigger('click')
    await flushPromises()
    expect(houseOf(wrapper, 'wc-papier').attributes('aria-pressed')).toBe('true')

    await houseOf(wrapper, 'wc-papier').trigger('click')
    await flushPromises()

    expect(pantryRequests).toEqual([
      ['wc-papier', true],
      [99, false],
    ])
    expect(houseOf(wrapper, 'wc-papier').attributes('aria-pressed')).toBe('false')
  })

  it('selectiemodus: "in huis" als label, en "Op lijst (n)" slaat die over', async () => {
    wrapper = await mountApp()
    await buttonWithText(wrapper, 'Selecteren').trigger('click')
    for (const name of ['melk', 'kaas', 'brood', 'wc-papier']) {
      await rowOf(wrapper, name).find('input[type="checkbox"]').setValue(true)
    }
    expect(rowOf(wrapper, 'melk').find('.in-house-tag').text()).toBe('in huis')
    expect(rowOf(wrapper, 'kaas').find('.in-house-tag').exists()).toBe(false)

    await buttonWithText(wrapper, 'Op lijst (4)').trigger('click')
    await flushPromises()

    expect(server.shoppingDb.map((item) => item.name).sort()).toEqual(['kaas', 'wc-papier'])
    expect(wrapper.find('[role="status"]').text()).toContain('2 toegevoegd, 2 al in huis.')
  })

  it('alles in huis: geen request, wel een melding', async () => {
    wrapper = await mountApp()
    await buttonWithText(wrapper, 'Selecteren').trigger('click')
    await rowOf(wrapper, 'melk').find('input[type="checkbox"]').setValue(true)

    await buttonWithText(wrapper, 'Op lijst (1)').trigger('click')
    await flushPromises()

    expect(server.shoppingDb).toEqual([])
    expect(wrapper.find('[role="status"]').text()).toContain(
      'Niets toegevoegd: alles is al in huis (1).',
    )
  })

  it('de losse [+] zet het wel op de lijst, ook als het in huis is', async () => {
    wrapper = await mountApp()

    await rowOf(wrapper, 'melk').find('.add-one').trigger('click')
    await flushPromises()

    expect(server.shoppingDb.map((item) => item.name)).toEqual(['melk'])
  })
})
