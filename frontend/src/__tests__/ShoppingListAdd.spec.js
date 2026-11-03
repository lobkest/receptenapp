import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { fakeServer } from './helpers'
import { clearMemoryStorage } from '../offline/storage'
import { listLines, mountRoute } from './mount'

// "Iets toevoegen…" bovenaan de boodschappenlijst (ShoppingListAddField): online en offline.
const INGREDIENTS = [
  { id: 20, name: 'ui' },
  { id: 21, name: 'rode ui' },
]

function addRequests(fetch) {
  return fetch.mock.calls
    .filter(([url]) => url === '/api/shopping_list_items/add')
    .map(([, options]) => JSON.parse(options.body))
}

describe('los item op de boodschappenlijst', () => {
  let wrapper
  let server

  beforeEach(() => {
    localStorage.clear()
    clearMemoryStorage()
    server = fakeServer({ ingredients: INGREDIENTS })
  })

  afterEach(() => {
    wrapper?.unmount()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  async function mountList() {
    ;({ wrapper } = await mountRoute('/boodschappen', { app: true, attach: true }))
    return wrapper.find('.add-input')
  }

  it('Enter zet vrije tekst met aantal erop, en het veld blijft leeg en gefocust', async () => {
    const input = await mountList()

    await input.setValue('3 wasmiddel')
    await wrapper.find('form.add-field').trigger('submit')
    await flushPromises()

    expect(addRequests(server.fetch)).toEqual([
      { name: 'wasmiddel', count: 3, ingredient_id: null, client_action_id: expect.any(String) },
    ])
    expect(listLines(wrapper)).toEqual(['wasmiddel'])
    expect(input.element.value).toBe('')
    expect(document.activeElement).toBe(input.element)
  })

  it('een suggestie kiezen koppelt aan dat ingrediënt; nog een keer telt op', async () => {
    const input = await mountList()

    await input.setValue('ui 2')
    const chips = wrapper.findAll('.suggestion')
    expect(chips.map((chip) => chip.attributes('data-ingredient-id'))).toEqual(['20', '21'])
    await chips[0].trigger('click')
    await flushPromises()
    await input.setValue('ui')
    await wrapper.find('form.add-field').trigger('submit')
    await flushPromises()

    expect(
      addRequests(server.fetch).map((body) => [body.name, body.ingredient_id, body.count]),
    ).toEqual([
      ['ui', 20, 2],
      ['ui', 20, 1],
    ])
    expect(server.shoppingDb.map((line) => [line.name, line.count])).toEqual([['ui', 3]])
  })

  it('offline: meteen op de lijst met "wacht op sync" en de teller', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const input = await mountList()

    await input.setValue('appels')
    await wrapper.find('form.add-field').trigger('submit')
    await flushPromises()

    expect(listLines(wrapper)).toEqual(['appels'])
    expect(wrapper.find('.items li.pending .pending-mark').exists()).toBe(true)
    expect(wrapper.find('.offline-notice .pending').text()).toBe('1 wijziging wacht op verbinding')
    expect(addRequests(server.fetch)).toEqual([])
  })
})
