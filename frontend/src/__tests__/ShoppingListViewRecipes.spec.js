import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { fakeServer } from './helpers'
import { clearMemoryStorage } from '../offline/storage'
import { listLines, mountRoute } from './mount'

// "Recepten op je lijst" en "Groepeer per recept" op de boodschappenlijst.

const orzo = { recipe_id: 1, recipe_title: 'Pien orzo', source_label: 'Pien orzo' }
const wok = { recipe_id: 2, recipe_title: 'Wok met kip', source_label: 'Wok met kip' }

const ITEMS = [
  { id: 1, name: 'orzo', quantity: 250, unit: 'g', ...orzo },
  { id: 2, name: 'kip', quantity: 300, unit: 'g', ...wok },
  { id: 3, name: 'melk', quantity: 200, unit: 'ml', ...orzo, count: 2, standard_count: 1 },
  { id: 4, name: 'wc-papier', source_label: 'standaard', standard_count: 1 },
  { id: 5, name: 'feta', ...orzo, checked: true },
  { id: 6, name: 'courgette', ...orzo },
]

async function mountApp(path = '/boodschappen') {
  return mountRoute(path, { app: true })
}

function boxRows(wrapper) {
  return wrapper
    .findAll('.list-recipes li')
    .map((li) => [li.find('.name').text(), li.find('.count').text()])
}

describe('Recepten op je lijst', () => {
  let wrapper
  let server

  beforeEach(() => {
    localStorage.clear()
    clearMemoryStorage()
    server = fakeServer({ shopping: ITEMS })
  })

  afterEach(() => {
    wrapper?.unmount()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('toont per recept de open regels, nieuwste bovenaan, met een link', async () => {
    ;({ wrapper } = await mountApp())

    expect(boxRows(wrapper)).toEqual([
      ['Pien orzo', '3 items'],
      ['Wok met kip', '1 item'],
    ])
    expect(wrapper.find('.list-recipes a').attributes('href')).toBe('/recepten/1')
  })

  it('zonder recepten op de lijst geen vakje', async () => {
    server = fakeServer({ shopping: [ITEMS[3]] })
    ;({ wrapper } = await mountApp())

    expect(listLines(wrapper)).toEqual(['wc-papier'])
    expect(wrapper.find('.list-recipes').exists()).toBe(false)
  })

  it('een recept met een verwijderverzoek: naam zonder link', async () => {
    server = fakeServer({ shopping: [{ ...ITEMS[1], recipe_visible: false }] })
    ;({ wrapper } = await mountApp())

    expect(boxRows(wrapper)).toEqual([['Wok met kip', '1 item']])
    expect(wrapper.find('.list-recipes a').exists()).toBe(false)
  })

  it('groeperen zet ?groep=recept in de URL en toont secties; "Groepering uit" zet het terug', async () => {
    let router
    ;({ wrapper, router } = await mountApp())
    const before = listLines(wrapper)
    expect(wrapper.find('.section-title').exists()).toBe(false)
    expect(wrapper.find('.ungroup').exists()).toBe(false)

    await wrapper.find('.group-toggle input').setValue(true)
    await flushPromises()

    expect(router.currentRoute.value.query).toEqual({ groep: 'recept' })
    expect(wrapper.findAll('.section-title').map((h) => h.text())).toEqual([
      'Pien orzo',
      'Wok met kip',
      'Los / standaardlijst',
    ])
    expect(wrapper.findAll('.section').map((s) => s.findAll('.line').map((l) => l.text()))).toEqual(
      [['250 g orzo', '400 ml melk (×2)', 'feta', 'courgette'], ['300 g kip'], ['wc-papier']],
    )
    expect(wrapper.find('.section li:nth-child(3)').classes()).toContain('checked')

    await wrapper.find('.ungroup').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({})
    expect(listLines(wrapper)).toEqual(before)
    expect(wrapper.find('.section-title').exists()).toBe(false)
  })

  it('opent gegroepeerd met ?groep=recept in de URL', async () => {
    ;({ wrapper } = await mountApp('/boodschappen?groep=recept'))

    expect(wrapper.find('.group-toggle input').element.checked).toBe(true)
    expect(wrapper.findAll('.section-title')).toHaveLength(3)
  })

  it('verwijder: vraagt bevestiging en haalt in één request de open regels weg', async () => {
    ;({ wrapper } = await mountApp())

    await wrapper.find('.list-recipes li .remove-recipe').trigger('click')
    await flushPromises()
    const dialog = wrapper.find('dialog')
    expect(dialog.find('h2').text()).toBe("2 items van 'Pien orzo' van de lijst halen?")
    expect(dialog.text()).toContain(
      '1 item blijft staan omdat het ook via de standaardlijst is toegevoegd.',
    )

    await dialog.find('.confirm').trigger('click')
    await flushPromises()

    const deletes = server.fetch.mock.calls.filter(([, o]) => o.method === 'DELETE')
    expect(deletes.map(([url]) => url)).toEqual(['/api/shopping_list_items?recipe_id=1'])
    // Afgevinkte feta blijft; melk blijft als standaardregel; de wok blijft.
    expect(listLines(wrapper)).toEqual(['300 g kip', 'melk', 'wc-papier', 'feta'])
    expect(boxRows(wrapper)).toEqual([['Wok met kip', '1 item']])
  })

  it('annuleren haalt niets weg', async () => {
    ;({ wrapper } = await mountApp())

    await wrapper.find('.list-recipes li .remove-recipe').trigger('click')
    await flushPromises()
    await wrapper.find('dialog .cancel').trigger('click')
    await flushPromises()

    expect(server.fetch.mock.calls.filter(([, o]) => o.method === 'DELETE')).toEqual([])
    expect(listLines(wrapper)).toHaveLength(6)
  })

  it('een verwijderd recept gaat op zijn naam', async () => {
    server = fakeServer({ shopping: [{ id: 9, name: 'prei', source_label: 'Oude soep' }] })
    ;({ wrapper } = await mountApp())

    await wrapper.find('.list-recipes li .remove-recipe').trigger('click')
    await flushPromises()
    await wrapper.find('dialog .confirm').trigger('click')
    await flushPromises()

    const deletes = server.fetch.mock.calls.filter(([, o]) => o.method === 'DELETE')
    expect(deletes.map(([url]) => url)).toEqual([
      '/api/shopping_list_items?source_label=Oude%20soep',
    ])
    expect(wrapper.find('.empty').exists()).toBe(true)
  })

  it('offline: groeperen werkt op de opgeslagen kopie, verwijderen is uit', async () => {
    ;({ wrapper } = await mountApp())
    wrapper.unmount()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)

    let router
    ;({ wrapper, router } = await mountApp())
    expect(wrapper.find('.offline-notice').exists()).toBe(true)

    await wrapper.find('.group-toggle input').setValue(true)
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ groep: 'recept' })
    expect(wrapper.findAll('.section-title').map((h) => h.text())).toEqual([
      'Pien orzo',
      'Wok met kip',
      'Los / standaardlijst',
    ])
    for (const button of wrapper.findAll('.remove-recipe')) {
      expect(button.attributes('disabled')).toBeDefined()
    }
    expect(wrapper.find('.list-recipes .offline-hint').text()).toBe(
      'Verwijderen kan alleen online.',
    )
  })
})
