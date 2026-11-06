import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { resetServerStatus } from '../stores/serverStatus'
import { fakeServer, goOffline, jsonResponse } from './helpers'
import { mountRoute } from './mount'

// Een standaarditem koppelen aan een ingrediënt met een andere naam ("uien" is "ui"):
// het blok "Mogelijk hetzelfde", het veld in het bewerkformulier, en het huisje en
// "✓ op lijst" die dan op ingredient_id matchen.

const INGREDIENTS = [
  { id: 5, name: 'ui' },
  { id: 6, name: 'rode ui' },
  { id: 7, name: 'prei' },
]

let server
let fetch

// pantryIds: wat in huis is. Alles wat geen voorraad is, gaat naar de nep-server.
function serve({ standard, shopping = [], linkPairs = [], pantryIds = [] }) {
  server = fakeServer({ standard, shopping, ingredients: INGREDIENTS, linkPairs })
  const inner = server.fetch
  fetch = vi.fn(async (url, options = {}) => {
    if (url === '/api/pantry') {
      return jsonResponse({
        in_house: INGREDIENTS.filter((i) => pantryIds.includes(i.id)),
        staples: [],
        suggestions: [],
      })
    }
    return inner(url, options)
  })
  vi.stubGlobal('fetch', fetch)
}

function posts(path) {
  return fetch.mock.calls
    .filter(([url, options]) => options?.method === 'POST' && url.endsWith(path))
    .map(([, options]) => JSON.parse(options.body ?? '{}'))
}

function rowOf(wrapper, name) {
  return wrapper.findAll('.items li').find((li) => li.find('.line').text() === name)
}

function pairs(wrapper) {
  return wrapper.findAll('.link-pair')
}

async function mountPage() {
  const { wrapper } = await mountRoute('/standaard')
  return wrapper
}

describe('standaarditem koppelen aan een ingrediënt', () => {
  let wrapper

  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
    resetServerStatus()
  })

  afterEach(() => {
    wrapper?.unmount()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('"Mogelijk hetzelfde (n)": één regel per paar, dicht', async () => {
    serve({
      standard: [{ id: 1, name: 'uien', category: null }],
      linkPairs: [
        ['uien', 'ui'],
        ['uien', 'rode ui'],
      ],
    })
    wrapper = await mountPage()

    const block = wrapper.find('details.link-suggestions')
    expect(block.attributes('open')).toBeUndefined()
    expect(block.find('summary').text()).toContain('(2)')
    expect(pairs(wrapper).map((pair) => pair.attributes('data-ingredient-id'))).toEqual(['5', '6'])
  })

  it('"Ja, hetzelfde" koppelt: blok weg, huisje en "✓ op lijst" via het ingrediënt', async () => {
    serve({
      standard: [{ id: 1, name: 'uien', category: null }],
      shopping: [{ id: 50, name: 'ui', ingredient_id: 5, source_label: 'Soep', recipe_id: 3 }],
      linkPairs: [['uien', 'ui']],
      pantryIds: [5],
    })
    wrapper = await mountPage()
    expect(rowOf(wrapper, 'uien').find('.on-list').exists()).toBe(false)
    expect(rowOf(wrapper, 'uien').find('.house-button').attributes('aria-pressed')).toBe('false')

    await wrapper.find('.link-pair .accept-link').trigger('click')
    await flushPromises()

    expect(posts('/1/link')).toEqual([{ ingredient_id: 5 }])
    expect(wrapper.find('.link-suggestions').exists()).toBe(false)
    expect(server.standardDb[0].ingredient_id).toBe(5)
    expect(rowOf(wrapper, 'uien').find('.on-list').exists()).toBe(true)
    expect(rowOf(wrapper, 'uien').find('.house-button').attributes('aria-pressed')).toBe('true')
  })

  it('"Nee" wijst alleen dat paar af', async () => {
    serve({
      standard: [{ id: 1, name: 'uien', category: null }],
      linkPairs: [
        ['uien', 'ui'],
        ['uien', 'rode ui'],
      ],
    })
    wrapper = await mountPage()

    await pairs(wrapper)
      .find((pair) => pair.attributes('data-ingredient-id') === '6')
      .find('.reject-link')
      .trigger('click')
    await flushPromises()

    expect(posts('/1/reject_link')).toEqual([{ ingredient_id: 6 }])
    expect(pairs(wrapper).map((pair) => pair.attributes('data-ingredient-id'))).toEqual(['5'])
  })

  it('zonder koppeling telt de naam, zoals voorheen', async () => {
    serve({
      standard: [{ id: 1, name: 'uien', category: null }],
      shopping: [{ id: 50, name: 'ui', ingredient_id: 5, source_label: 'Soep', recipe_id: 3 }],
      pantryIds: [5],
    })
    wrapper = await mountPage()

    expect(wrapper.find('.link-suggestions').exists()).toBe(false)
    expect(rowOf(wrapper, 'uien').find('.on-list').exists()).toBe(false)
    expect(rowOf(wrapper, 'uien').find('.house-button').attributes('aria-pressed')).toBe('false')
  })

  it('bewerken: "Hetzelfde als ingrediënt" kiezen en opslaan koppelt', async () => {
    serve({ standard: [{ id: 1, name: 'uien', category: null }] })
    wrapper = await mountPage()

    await rowOf(wrapper, 'uien').find('.edit').trigger('click')
    await wrapper.find('.link-search input').setValue('ui')
    await wrapper
      .findAll('.link-search .add-chip')
      .find((chip) => chip.text() === '+ ui')
      .trigger('click')
    expect(wrapper.find('.linked-name').text()).toBe('ui')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(posts('/1/link')).toEqual([{ ingredient_id: 5 }])
    expect(server.standardDb[0].ingredient_id).toBe(5)
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('bewerken: ontkoppelen, en zonder wijziging geen koppelrequest', async () => {
    serve({ standard: [{ id: 1, name: 'uien', category: null, ingredient_id: 5 }] })
    wrapper = await mountPage()

    await rowOf(wrapper, 'uien').find('.edit').trigger('click')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(posts('/1/link')).toEqual([])
    expect(posts('/1/unlink')).toEqual([])

    await rowOf(wrapper, 'uien').find('.edit').trigger('click')
    await wrapper.find('.unlink').trigger('click')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(posts('/1/unlink')).toHaveLength(1)
    expect(server.standardDb[0].ingredient_id).toBeNull()
  })

  it('offline: koppelknoppen uit, het huisje werkt met ingredient_id uit de kopie', async () => {
    serve({
      standard: [
        { id: 1, name: 'uien', category: null, ingredient_id: 5 },
        { id: 2, name: 'preien', category: null },
      ],
      linkPairs: [['preien', 'prei']],
      pantryIds: [5],
    })
    wrapper = await mountPage()

    await goOffline()

    expect(wrapper.find('.accept-link').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.reject-link').attributes('disabled')).toBeDefined()
    expect(rowOf(wrapper, 'uien').find('.house-button').attributes('aria-pressed')).toBe('true')

    await rowOf(wrapper, 'preien').find('.edit').trigger('click')
    expect(wrapper.find('.link-search').exists()).toBe(false)
    expect(wrapper.find('form .offline-hint').exists()).toBe(true)
  })
})
