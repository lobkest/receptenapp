import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import App from '../App.vue'
import { routes } from '../router'
import { fakeStandardServer, jsonResponse } from './helpers'

// "In huis" op de standaardlijst: het huisje per item (op naam gematcht), en "Op lijst (n)"
// in de selectiemodus slaat wat in huis is over.

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
  const pantry = () => ({
    in_house: INGREDIENTS.filter((i) => i.id !== 12 && present.has(i.id)),
    staples: [{ id: 12, name: 'brood', present: present.has(12) }],
    suggestions: [],
  })
  const inner = server.fetch
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, options = {}) => {
      if (url === '/api/ingredients') return jsonResponse(INGREDIENTS)
      if (url === '/api/pantry') return jsonResponse(pantry())
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
  setActivePinia(createPinia())
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push('/standaard')
  const wrapper = mount(App, { global: { plugins: [router] }, attachTo: document.body })
  await flushPromises()
  return wrapper
}

function rowOf(wrapper, name) {
  return wrapper.findAll('.items li').find((li) => li.find('.line').text() === name)
}

function buttonWithText(wrapper, text) {
  return wrapper.findAll('button').find((b) => b.text() === text)
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

  it('huisje op naam: in huis, basis, niet in huis; zonder ingrediënt geen huisje', async () => {
    wrapper = await mountApp()

    expect(rowOf(wrapper, 'melk').find('.house-button').text()).toBe('in huis')
    expect(rowOf(wrapper, 'brood').find('.house-button').text()).toBe('in huis')
    expect(rowOf(wrapper, 'kaas').find('.house-button').text()).toBe('')
    expect(rowOf(wrapper, 'wc-papier').find('.house-button').exists()).toBe(false)
  })

  it('een tik zet het in de voorraad', async () => {
    wrapper = await mountApp()

    await rowOf(wrapper, 'kaas').find('.house-button').trigger('click')
    await flushPromises()

    expect(pantryRequests).toEqual([[11, true]])
    expect(rowOf(wrapper, 'kaas').find('.house-button').text()).toBe('in huis')
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
