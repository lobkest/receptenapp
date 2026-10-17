import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import App from '../App.vue'
import { routes } from '../router'
import { fakeServer, fakeStandardServer, jsonResponse, mockFetch } from './helpers'

const ITEMS = [
  { id: 1, name: 'melk', category: 'zuivel' },
  { id: 2, name: 'kaas', category: 'zuivel' },
  { id: 3, name: 'banaan', category: 'groente & fruit' },
  { id: 4, name: 'wc-papier', category: null },
]

// Monteert de hele App, zodat ook het menu echt werkt.
// attachTo: anders kan de focus in jsdom niet naar een knop.
async function mountApp() {
  setActivePinia(createPinia())
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push('/standaard')
  const wrapper = mount(App, {
    global: { plugins: [router] },
    attachTo: document.body,
  })
  await flushPromises()
  return { wrapper, router }
}

function buttonWithText(wrapper, text) {
  return wrapper.findAll('button').find((b) => b.text() === text)
}

function lines(wrapper) {
  return wrapper.findAll('.items .line').map((l) => l.text())
}

function rowOf(wrapper, name) {
  return wrapper.findAll('.items li').find((li) => li.find('.line').text() === name)
}

function dialog(wrapper) {
  return wrapper.find('dialog')
}

// De nep-server van de huidige test (zie beforeEach).
let server

// Wat er op de (gedeelde) boodschappenlijst op de server staat.
function shoppingNames() {
  return server.shoppingDb.map((i) => i.name)
}

describe('StandardItemsView', () => {
  let wrapper

  beforeEach(() => {
    sessionStorage.clear()
    server = fakeStandardServer(ITEMS)
  })

  afterEach(() => {
    wrapper?.unmount()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('staat in het hoofdmenu', async () => {
    ;({ wrapper } = await mountApp())

    const link = wrapper.findAll('nav a').find((a) => a.text() === 'Standaard')
    expect(link.attributes('href')).toBe('/standaard')
  })

  it('werkt zonder beheercode: geen inlogmelding, en de lijst komt van de openbare API', async () => {
    ;({ wrapper } = await mountApp())

    expect(wrapper.text()).not.toContain('beheercode')
    expect(wrapper.find('.login-needed').exists()).toBe(false)
    expect(wrapper.find('.add-card').exists()).toBe(true)
    expect(lines(wrapper)).toHaveLength(4)
    const urls = server.fetch.mock.calls.map(([url]) => url)
    expect(urls).toContain('/api/standard_items')
    expect(urls.some((url) => url.includes('/admin/'))).toBe(false)
    expect(server.fetch.mock.calls.every(([, o]) => !o.headers?.Authorization)).toBe(true)
  })

  it('toont een melding als de lijst niet geladen kan worden', async () => {
    mockFetch(() => jsonResponse({}, 500))
    ;({ wrapper } = await mountApp())

    expect(wrapper.find('[role="alert"]').text()).toBe('Er ging iets mis op de server.')
  })

  it('toont items per categorie, zonder categorie onder "overig", compact met drie icoonknoppen', async () => {
    ;({ wrapper } = await mountApp())

    expect(wrapper.findAll('.group h2').map((h) => h.text())).toEqual([
      'groente & fruit',
      'zuivel',
      'overig',
    ])
    expect(lines(wrapper)).toEqual(['banaan', 'kaas', 'melk', 'wc-papier'])
    expect(
      rowOf(wrapper, 'melk')
        .findAll('button')
        .map((b) => b.attributes('aria-label')),
    ).toEqual(['melk op boodschappenlijst', 'melk bewerken', 'melk verwijderen'])
  })

  it('heeft geen voorbeeldlijst meer', async () => {
    server = fakeStandardServer([])
    ;({ wrapper } = await mountApp())

    expect(wrapper.find('.empty').text()).toContain('nog geen standaardboodschappen')
    expect(wrapper.text()).not.toContain('Voorbeeldlijst')
  })

  describe('toevoegen', () => {
    it('met een nieuwe categorie: verschijnt in een eigen groep, en het formulier wordt leeg', async () => {
      ;({ wrapper } = await mountApp())
      const form = () => wrapper.find('.add-card form')

      await form().find('.name').setValue('Chocola')
      await form().find('select.category').setValue('NEW')
      await form().find('.new-category').setValue('Snoep')
      await form().trigger('submit')
      await flushPromises()

      expect(server.db).toContainEqual({ id: 5, name: 'chocola', category: 'snoep' })
      expect(wrapper.findAll('.group h2').map((h) => h.text())).toContain('snoep')
      expect(form().find('.name').element.value).toBe('')
      expect(form().find('.new-category').exists()).toBe(false)
      // De nieuwe categorie staat nu ook in de keuzelijst.
      const options = form()
        .findAll('select.category option')
        .map((o) => o.text())
      expect(options).toEqual([
        'Geen categorie',
        'groente & fruit',
        'snoep',
        'zuivel',
        'Nieuwe categorie…',
      ])
    })

    it('meldt een dubbele naam bij het veld en houdt de invoer', async () => {
      ;({ wrapper } = await mountApp())
      const form = wrapper.find('.add-card form')

      await form.find('.name').setValue('Melk')
      await form.trigger('submit')
      await flushPromises()

      expect(form.find('.error').text()).toBe('Naam is al in gebruik')
      expect(form.find('.name').element.value).toBe('Melk')
      expect(server.db).toHaveLength(4)
    })
  })

  it('bewerkt een item op zijn plek, en annuleren laat het ongemoeid', async () => {
    ;({ wrapper } = await mountApp())

    await rowOf(wrapper, 'wc-papier').find('.edit').trigger('click')
    let form = wrapper.find('.items form')
    expect(form.find('.name').element.value).toBe('wc-papier')
    await form.find('.cancel').trigger('click')
    expect(wrapper.find('.items form').exists()).toBe(false)

    await rowOf(wrapper, 'wc-papier').find('.edit').trigger('click')
    form = wrapper.find('.items form')
    await form.find('.name').setValue('Toiletpapier')
    await form.find('select.category').setValue('NEW')
    await form.find('.new-category').setValue('huishouden')
    await form.trigger('submit')
    await flushPromises()

    expect(wrapper.find('.items form').exists()).toBe(false)
    expect(server.db.find((i) => i.id === 4)).toEqual({
      id: 4,
      name: 'toiletpapier',
      category: 'huishouden',
    })
    expect(wrapper.findAll('.group h2').map((h) => h.text())).toContain('huishouden')
  })

  it('verwijdert pas na bevestiging: "banaan verwijderen?"', async () => {
    ;({ wrapper } = await mountApp())

    await rowOf(wrapper, 'banaan').find('.remove').trigger('click')
    await flushPromises()
    expect(dialog(wrapper).attributes('open')).toBeDefined()
    expect(dialog(wrapper).find('h2').text()).toBe('banaan verwijderen?')
    expect(document.activeElement).toBe(dialog(wrapper).find('.cancel').element)

    await dialog(wrapper).find('.cancel').trigger('click')
    await flushPromises()
    expect(lines(wrapper)).toContain('banaan')
    expect(server.db).toHaveLength(4)

    await rowOf(wrapper, 'banaan').find('.remove').trigger('click')
    await flushPromises()
    await dialog(wrapper).find('.confirm').trigger('click')
    await flushPromises()
    expect(lines(wrapper)).not.toContain('banaan')
    expect(server.db.map((i) => i.name)).not.toContain('banaan')
  })

  it('zet één item op de boodschappenlijst, met een bevestiging die weer verdwijnt', async () => {
    vi.useFakeTimers()
    ;({ wrapper } = await mountApp())

    await rowOf(wrapper, 'melk').find('.add-one').trigger('click')
    await flushPromises()

    expect(shoppingNames()).toEqual(['melk'])
    expect(server.shoppingDb[0]).toMatchObject({ quantity: null, source_label: 'standaard' })
    expect(wrapper.find('.shopping-link').text()).toBe('Boodschappen (1)')
    expect(wrapper.find('[role="status"]').text()).toContain('melk staat op je boodschappenlijst.')
    expect(wrapper.find('[role="status"] a').text()).toBe('Bekijk lijst')
    await vi.advanceTimersByTimeAsync(3000)
    expect(wrapper.find('.bottom-bar').exists()).toBe(false)
  })

  describe('al op de boodschappenlijst', () => {
    // melk staat open op de lijst (uit een recept), kaas is afgevinkt: telt niet.
    beforeEach(() => {
      server = fakeServer({
        standard: ITEMS,
        shopping: [
          { id: 1, name: 'melk', quantity: 200, unit: 'ml', source_label: 'Pap', recipe_id: 7 },
          { id: 2, name: 'kaas', source_label: 'standaard', checked: true },
        ],
      })
      server.db = server.standardDb
    })

    it('toont "✓ op lijst" in plaats van [+], alleen bij een open regel', async () => {
      ;({ wrapper } = await mountApp())

      expect(rowOf(wrapper, 'melk').find('.add-one').text()).toBe('✓ op lijst')
      expect(rowOf(wrapper, 'melk').find('.add-one').classes()).toContain('on-list')
      expect(rowOf(wrapper, 'kaas').find('.add-one').text()).toBe('')
      expect(rowOf(wrapper, 'kaas').find('.add-one').attributes('aria-label')).toBe(
        'kaas op boodschappenlijst',
      )
    })

    it('[+] wordt meteen "✓ op lijst"; nog een tik telt op, zonder nieuwe regel', async () => {
      ;({ wrapper } = await mountApp())

      await rowOf(wrapper, 'banaan').find('.add-one').trigger('click')
      await flushPromises()
      expect(rowOf(wrapper, 'banaan').find('.add-one').text()).toBe('✓ op lijst')
      expect(wrapper.find('[role="status"]').text()).toContain(
        'banaan staat op je boodschappenlijst.',
      )

      await rowOf(wrapper, 'banaan').find('.add-one').trigger('click')
      await flushPromises()
      const banaan = server.shoppingDb.filter((i) => i.name === 'banaan')
      expect(banaan).toHaveLength(1)
      expect(banaan[0].standard_count).toBe(2)
      expect(wrapper.find('[role="status"]').text()).toContain(
        'Nog een banaan op je boodschappenlijst.',
      )
    })

    it('een tik op "✓ op lijst" bij een receptregel telt daar één bij op', async () => {
      ;({ wrapper } = await mountApp())

      await rowOf(wrapper, 'melk').find('.add-one').trigger('click')
      await flushPromises()

      expect(server.shoppingDb.filter((i) => i.name === 'melk')).toEqual([
        expect.objectContaining({ id: 1, quantity: 200, standard_count: 1 }),
      ])
    })

    it('toont in de selectiemodus ook wat er al op staat', async () => {
      ;({ wrapper } = await mountApp())
      await buttonWithText(wrapper, 'Selecteren').trigger('click')

      expect(rowOf(wrapper, 'melk').find('.on-list-tag').text()).toBe('✓ op lijst')
      expect(rowOf(wrapper, 'kaas').find('.on-list-tag').exists()).toBe(false)
    })
  })

  describe('selectiemodus', () => {
    async function startSelecting() {
      ;({ wrapper } = await mountApp())
      await buttonWithText(wrapper, 'Selecteren').trigger('click')
    }

    async function select(...names) {
      for (const name of names) await rowOf(wrapper, name).find('input').setValue(true)
    }

    it('heeft buiten de selectiemodus geen checkboxes en geen balk', async () => {
      ;({ wrapper } = await mountApp())

      expect(wrapper.findAll('.items input[type="checkbox"]')).toHaveLength(0)
      expect(wrapper.find('.bottom-bar').exists()).toBe(false)
    })

    it('toont checkboxes en een balk met tellers; de icoonknoppen verdwijnen', async () => {
      await startSelecting()

      expect(wrapper.findAll('.items input[type="checkbox"]')).toHaveLength(4)
      expect(wrapper.findAll('.items .icon')).toHaveLength(0)
      expect(buttonWithText(wrapper, 'Selecteren')).toBeUndefined()
      expect(buttonWithText(wrapper, 'Op lijst (0)').attributes('disabled')).toBeDefined()
      expect(buttonWithText(wrapper, 'Verwijderen (0)').attributes('disabled')).toBeDefined()

      await select('melk', 'kaas')

      expect(buttonWithText(wrapper, 'Op lijst (2)').attributes('disabled')).toBeUndefined()
      expect(buttonWithText(wrapper, 'Verwijderen (2)').attributes('disabled')).toBeUndefined()
    })

    it('zet de selectie op de boodschappenlijst en stopt dan', async () => {
      await startSelecting()
      await select('melk', 'wc-papier')

      await buttonWithText(wrapper, 'Op lijst (2)').trigger('click')
      await flushPromises()

      // Eén request voor de hele selectie.
      const posts = server.fetch.mock.calls.filter(
        ([url, o]) => url === '/api/standard_items/add_to_shopping_list' && o.method === 'POST',
      )
      expect(posts).toHaveLength(1)
      expect(shoppingNames()).toEqual(['melk', 'wc-papier'])
      expect(wrapper.find('[role="status"]').text()).toContain(
        '2 items op je boodschappenlijst gezet.',
      )
      expect(wrapper.findAll('.items input[type="checkbox"]')).toHaveLength(0)
    })

    it('verwijdert de selectie na één bevestiging, via bulk_destroy', async () => {
      await startSelecting()
      await select('melk', 'kaas', 'banaan')

      await buttonWithText(wrapper, 'Verwijderen (3)').trigger('click')
      await flushPromises()
      expect(dialog(wrapper).find('h2').text()).toBe('3 items verwijderen?')
      await dialog(wrapper).find('.confirm').trigger('click')
      await flushPromises()

      const posts = server.fetch.mock.calls.filter(([, o]) => o.method === 'POST')
      expect(posts.map(([url]) => url)).toEqual(['/api/standard_items/bulk_destroy'])
      expect(JSON.parse(posts[0][1].body).ids.sort()).toEqual([1, 2, 3])
      expect(lines(wrapper)).toEqual(['wc-papier'])
      expect(wrapper.find('[role="status"]').text()).toContain('3 items verwijderd.')
      // Na verwijderen is er niets op de boodschappenlijst gezet: geen link erheen.
      expect(wrapper.find('[role="status"] a').exists()).toBe(false)
      expect(wrapper.findAll('.items input[type="checkbox"]')).toHaveLength(0)
    })

    it('verwijdert niets als je de bevestiging annuleert, en blijft in de selectiemodus', async () => {
      await startSelecting()
      await select('melk')

      await buttonWithText(wrapper, 'Verwijderen (1)').trigger('click')
      await flushPromises()
      expect(dialog(wrapper).find('h2').text()).toBe('1 item verwijderen?')
      await dialog(wrapper).find('.cancel').trigger('click')
      await flushPromises()

      expect(server.db).toHaveLength(4)
      expect(buttonWithText(wrapper, 'Verwijderen (1)')).toBeDefined()
    })

    it('stopt met Annuleren en vergeet de selectie', async () => {
      await startSelecting()
      await select('melk')

      await buttonWithText(wrapper, 'Annuleren').trigger('click')
      expect(wrapper.find('.bottom-bar').exists()).toBe(false)

      await buttonWithText(wrapper, 'Selecteren').trigger('click')
      expect(buttonWithText(wrapper, 'Op lijst (0)')).toBeDefined()
    })
  })
})
