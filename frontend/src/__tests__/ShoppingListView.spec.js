import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import App from '../App.vue'
import { routes } from '../router'
import { fakeServer, jsonResponse, mockFetch } from './helpers'
import { clearMemoryStorage } from '../offline/storage'

const ITEMS = [
  { id: 1, name: 'bloem', quantity: 300, unit: 'g', source_label: 'Wafels' },
  { id: 2, name: 'zout', source_label: 'Pannenkoeken' },
  { id: 3, name: 'wc-papier' },
]

// Monteert de hele App, zodat we ook het menu (met het aantal) en het verversen testen.
async function mountApp(path = '/boodschappen') {
  setActivePinia(createPinia())
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push(path)
  const wrapper = mount(App, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

function buttonWithText(wrapper, text) {
  return wrapper.findAll('button').find((b) => b.text() === text)
}

function lines(wrapper) {
  return wrapper.findAll('.items .line').map((l) => l.text())
}

function getRequests(fetch) {
  return fetch.mock.calls.filter(([url, o]) => url === '/api/shopping_list_items' && !o.method)
}

// Zoals de browser het doet bij terugschakelen naar de app (of wegschakelen).
function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('ShoppingListView', () => {
  let wrapper
  let server

  beforeEach(() => {
    // Geen opgeslagen kopie van een vorige test.
    localStorage.clear()
    clearMemoryStorage()
    server = fakeServer({ shopping: ITEMS })
  })

  afterEach(() => {
    wrapper?.unmount()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    setVisibility('visible')
  })

  it('toont een lege lijst', async () => {
    server = fakeServer()
    ;({ wrapper } = await mountApp())

    expect(wrapper.find('.empty').text()).toContain('leeg')
    expect(wrapper.find('.shopping-link').text()).toBe('Boodschappen')
  })

  it('toont regels van de server met hoeveelheid en herkomst, met één request bij het openen', async () => {
    ;({ wrapper } = await mountApp())

    expect(lines(wrapper)).toEqual(['300 g bloem', 'zout', 'wc-papier'])
    expect(wrapper.findAll('.items .sources').map((s) => s.text())).toEqual([
      'uit: Wafels',
      'uit: Pannenkoeken',
    ])
    // App en pagina laden tegelijk; de store maakt daar één request van.
    expect(getRequests(server.fetch)).toHaveLength(1)
  })

  it('groepeert per categorie van de standaardlijst, met "overig" als laatste', async () => {
    server = fakeServer({
      shopping: [
        {
          id: 1,
          name: 'bloem',
          quantity: 300,
          unit: 'g',
          source_label: 'Wafels',
          category: 'bakken',
        },
        { id: 2, name: 'zout', source_label: 'Pannenkoeken' },
        { id: 3, name: 'melk', source_label: 'standaard', standard_count: 1, category: 'zuivel' },
        {
          id: 4,
          name: 'bakpoeder',
          source_label: 'standaard',
          standard_count: 1,
          category: 'bakken',
        },
      ],
    })
    ;({ wrapper } = await mountApp())

    expect(wrapper.findAll('.category-title').map((h) => h.text())).toEqual([
      'bakken',
      'zuivel',
      'overig',
    ])
    expect(lines(wrapper)).toEqual(['300 g bloem', 'bakpoeder', 'melk', 'zout'])
    // "uit: …" staat in dezelfde rij als de naam.
    expect(wrapper.find('.items li .text .sources').text()).toBe('uit: Wafels')
  })

  it('zegt niet meer dat de lijst alleen in deze browser staat', async () => {
    ;({ wrapper } = await mountApp())

    expect(wrapper.text()).not.toContain('alleen in deze browser')
    expect(wrapper.text()).not.toContain('dit apparaat')
  })

  it('toont het aantal open regels uit de API in het menu, ook op een andere pagina', async () => {
    server = fakeServer({ shopping: [...ITEMS, { id: 4, name: 'kaas', checked: true }] })
    mockFetch((method, url, options) =>
      url.startsWith('/api/recipes') ? jsonResponse([]) : server.fetch(url, options),
    )
    ;({ wrapper } = await mountApp('/'))

    expect(wrapper.find('.shopping-link').text()).toBe('Boodschappen (3)')
  })

  it('toont een melding als de lijst niet geladen kan worden', async () => {
    mockFetch(() => jsonResponse({}, 500))
    ;({ wrapper } = await mountApp())

    expect(wrapper.find('[role="alert"]').text()).toBe('Er ging iets mis op de server.')
    expect(wrapper.find('.empty').exists()).toBe(false)
  })

  describe('verversen', () => {
    it('haalt de lijst opnieuw op als je naar de app terugschakelt', async () => {
      ;({ wrapper } = await mountApp())
      // Intussen vinkt iemand op een andere telefoon de bloem af en zet er kaas bij.
      server.shoppingDb[0].checked = true
      server.shoppingDb.push({ id: 9, name: 'kaas', quantity: null, unit: null, checked: false })

      setVisibility('hidden')
      await flushPromises()
      expect(getRequests(server.fetch)).toHaveLength(1)

      setVisibility('visible')
      await flushPromises()

      expect(getRequests(server.fetch)).toHaveLength(2)
      expect(lines(wrapper)).toEqual(['300 g bloem', 'zout', 'wc-papier', 'kaas'])
      expect(wrapper.findAll('.items li')[0].classes()).toContain('checked')
      expect(wrapper.find('.shopping-link').text()).toBe('Boodschappen (3)')
    })

    it('haalt de lijst opnieuw op als je de pagina opnieuw opent', async () => {
      let router
      ;({ wrapper, router } = await mountApp())
      server.shoppingDb.splice(0, 1)

      await router.push('/standaard')
      await flushPromises()
      await router.push('/boodschappen')
      await flushPromises()

      expect(lines(wrapper)).toEqual(['zout', 'wc-papier'])
    })

    it('stopt met luisteren als de App weg is', async () => {
      ;({ wrapper } = await mountApp())
      wrapper.unmount()
      wrapper = null

      setVisibility('visible')
      await flushPromises()

      expect(getRequests(server.fetch)).toHaveLength(1)
    })
  })

  describe('afvinken', () => {
    it('vinkt af (doorgestreept), werkt het menu-aantal bij en slaat op de server op', async () => {
      ;({ wrapper } = await mountApp())

      await wrapper.find('.items input[type="checkbox"]').setValue(true)

      expect(wrapper.findAll('.items li')[0].classes()).toContain('checked')
      expect(wrapper.find('.shopping-link').text()).toBe('Boodschappen (2)')
      await flushPromises()
      expect(server.shoppingDb[0].checked).toBe(true)
    })

    it('draait het vinkje terug met een melding als opslaan mislukt', async () => {
      ;({ wrapper } = await mountApp())
      mockFetch(() => jsonResponse({}, 500))

      await wrapper.find('.items input[type="checkbox"]').setValue(true)
      // Meteen zichtbaar…
      expect(wrapper.findAll('.items li')[0].classes()).toContain('checked')
      await flushPromises()

      // …en na de fout weer terug, met een melding.
      expect(wrapper.findAll('.items li')[0].classes()).not.toContain('checked')
      expect(wrapper.find('.items input[type="checkbox"]').element.checked).toBe(false)
      expect(wrapper.find('.shopping-link').text()).toBe('Boodschappen (3)')
      expect(wrapper.find('[role="alert"]').text()).toBe('Er ging iets mis op de server.')
    })

    it('meldt het als een andere telefoon de regel al verwijderde', async () => {
      ;({ wrapper } = await mountApp())
      server.shoppingDb.splice(0, 1)

      await wrapper.find('.items input[type="checkbox"]').setValue(true)
      await flushPromises()

      expect(wrapper.find('[role="alert"]').text()).toBe('Deze regel bestaat niet meer.')
      expect(lines(wrapper)).toEqual(['zout', 'wc-papier'])
    })
  })

  it('verwijdert één regel', async () => {
    ;({ wrapper } = await mountApp())

    await wrapper.find('.items .remove').trigger('click')
    await flushPromises()

    expect(lines(wrapper)).toEqual(['zout', 'wc-papier'])
    expect(server.shoppingDb.map((i) => i.name)).toEqual(['zout', 'wc-papier'])
  })

  it('wist afgevinkte regels zonder te vragen', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    ;({ wrapper } = await mountApp())

    expect(buttonWithText(wrapper, 'Afgevinkte wissen').attributes('disabled')).toBeDefined()
    await wrapper.find('.items input[type="checkbox"]').setValue(true)
    await flushPromises()
    await buttonWithText(wrapper, 'Afgevinkte wissen').trigger('click')
    await flushPromises()

    expect(confirm).not.toHaveBeenCalled()
    expect(lines(wrapper)).toEqual(['zout', 'wc-papier'])
    expect(server.shoppingDb).toHaveLength(2)
  })

  it('wist alles alleen na bevestiging in het venster', async () => {
    ;({ wrapper } = await mountApp())
    const dialog = () => wrapper.find('dialog')

    await buttonWithText(wrapper, 'Alles wissen').trigger('click')
    await flushPromises()
    expect(dialog().attributes('open')).toBeDefined()
    expect(dialog().find('h2').text()).toBe('De hele boodschappenlijst wissen?')

    await dialog().find('.cancel').trigger('click')
    await flushPromises()
    expect(dialog().attributes('open')).toBeUndefined()
    expect(wrapper.findAll('.items li')).toHaveLength(3)

    await buttonWithText(wrapper, 'Alles wissen').trigger('click')
    await flushPromises()
    await dialog().find('.confirm').trigger('click')
    await flushPromises()
    expect(wrapper.find('.empty').exists()).toBe(true)
    expect(server.shoppingDb).toEqual([])
  })

  it('toont ingrediënten en beheer in de voettekst en niet in het menu', async () => {
    ;({ wrapper } = await mountApp())

    const footerLinks = wrapper.findAll('footer a')
    expect(footerLinks.map((a) => a.text())).toEqual(['Ingrediënten', 'Beheer'])
    expect(footerLinks.map((a) => a.attributes('href'))).toEqual(['/ingredienten', '/beheer'])
    expect(wrapper.find('nav').text()).not.toContain('Beheer')
    expect(wrapper.find('nav').text()).not.toContain('Ingrediënten')
    expect(wrapper.findAll('nav a')).toHaveLength(5)
  })

  describe('offline', () => {
    function setOnline(online) {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online)
      window.dispatchEvent(new Event(online ? 'online' : 'offline'))
    }

    function patchRequests() {
      return server.fetch.mock.calls.filter(([, o]) => o.method === 'PATCH')
    }

    it('toont online geen offline-melding, en alle knoppen werken', async () => {
      ;({ wrapper } = await mountApp())

      expect(wrapper.find('.offline-notice').exists()).toBe(false)
      expect(wrapper.find('.items .remove').attributes('disabled')).toBeUndefined()
      expect(buttonWithText(wrapper, 'Alles wissen').attributes('disabled')).toBeUndefined()
    })

    it('toont offline de opgeslagen lijst met tijdstip, en schakelt wissen uit', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(new Date(2026, 9, 16, 9, 41).getTime())
      ;({ wrapper } = await mountApp())
      wrapper.unmount()
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)

      // Opnieuw openen zonder verbinding (een nieuwe Pinia is een herladen pagina).
      ;({ wrapper } = await mountApp())

      // Echt offline (navigator.onLine false): "Offline" in plaats van "bijwerken…".
      expect(wrapper.find('.offline-notice').text()).toMatch(
        /^Offline kopie van 16 okt om 09:41, Offline/,
      )
      expect(lines(wrapper)).toEqual(['300 g bloem', 'zout', 'wc-papier'])
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
      for (const button of wrapper.findAll('.items .remove')) {
        expect(button.attributes('disabled')).toBeDefined()
      }
      expect(buttonWithText(wrapper, 'Afgevinkte wissen').attributes('disabled')).toBeDefined()
      expect(buttonWithText(wrapper, 'Alles wissen').attributes('disabled')).toBeDefined()
      expect(wrapper.find('.items input[type="checkbox"]').attributes('disabled')).toBeUndefined()
    })

    it('vinkt offline af, en verstuurt dat zodra de verbinding terug is', async () => {
      ;({ wrapper } = await mountApp())
      setOnline(false)
      await flushPromises()
      expect(wrapper.find('.offline-notice').exists()).toBe(true)

      await wrapper.findAll('.items input[type="checkbox"]')[1].setValue(true)
      await flushPromises()
      expect(wrapper.findAll('.items li')[1].classes()).toContain('checked')
      expect(wrapper.find('.shopping-link').text()).toBe('Boodschappen (2)')
      expect(patchRequests()).toHaveLength(0)
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)

      setOnline(true)
      await flushPromises()

      expect(patchRequests()).toHaveLength(1)
      expect(server.shoppingDb[1].checked).toBe(true)
      expect(wrapper.find('.offline-notice').exists()).toBe(false)
      expect(buttonWithText(wrapper, 'Alles wissen').attributes('disabled')).toBeUndefined()
    })

    it('telt de wijzigingen die nog niet gesynchroniseerd zijn', async () => {
      ;({ wrapper } = await mountApp())
      setOnline(false)
      await flushPromises()

      const checkboxes = wrapper.findAll('.items input[type="checkbox"]')
      await checkboxes[0].setValue(true)
      await flushPromises()
      expect(wrapper.find('.offline-notice .pending').text()).toBe(
        '1 wijziging nog niet gesynchroniseerd',
      )
      await checkboxes[1].setValue(true)
      await flushPromises()
      expect(wrapper.find('.offline-notice .pending').text()).toBe(
        '2 wijzigingen nog niet gesynchroniseerd',
      )

      setOnline(true)
      await flushPromises()
      expect(wrapper.find('.offline-notice').exists()).toBe(false)
    })

    it('verstuurt de wachtrij ook bij terugkeren naar de app', async () => {
      ;({ wrapper } = await mountApp())
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
      await wrapper.find('.items input[type="checkbox"]').setValue(true)
      await flushPromises()

      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
      setVisibility('hidden')
      setVisibility('visible')
      await flushPromises()

      expect(server.shoppingDb[0].checked).toBe(true)
    })

    it('toont de offline-melding als de server niet te bereiken is', async () => {
      ;({ wrapper } = await mountApp())
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

      setVisibility('hidden')
      setVisibility('visible')
      await flushPromises()

      // Wel netwerk, maar geen server: we blijven proberen.
      expect(wrapper.find('.offline-notice').text()).toMatch(
        /^Offline kopie van \d{1,2} [a-z]{3}( \d{4})? om \d\d:\d\d, bijwerken…/,
      )
      expect(lines(wrapper)).toEqual(['300 g bloem', 'zout', 'wc-papier'])
    })

    it('stopt met luisteren naar online als de App weg is', async () => {
      ;({ wrapper } = await mountApp())
      wrapper.unmount()
      wrapper = null

      setOnline(true)
      await flushPromises()

      expect(getRequests(server.fetch)).toHaveLength(1)
    })
  })

  describe('standaardlijst-teller', () => {
    beforeEach(() => {
      server = fakeServer({
        shopping: [
          { id: 1, name: 'melk', source_label: 'standaard', standard_count: 2 },
          {
            id: 2,
            name: 'bloem',
            quantity: 200,
            unit: 'g',
            source_label: 'Wafels',
            recipe_id: 3,
            standard_count: 1,
          },
          { id: 3, name: 'zout', source_label: 'Pannenkoeken', recipe_id: 4 },
        ],
      })
    })

    function rowOf(wrapper, id) {
      return wrapper.find(`.items li[data-id="${id}"]`)
    }

    it('toont "×2" en "+1", en de −-knop alleen bij iets van de standaardlijst', async () => {
      ;({ wrapper } = await mountApp())

      expect(lines(wrapper)).toEqual(['melk ×2', '200 g bloem +1', 'zout'])
      expect(rowOf(wrapper, 2).find('.sources').text()).toBe('uit: Wafels, standaard')
      expect(rowOf(wrapper, 1).find('.minus').exists()).toBe(true)
      expect(rowOf(wrapper, 2).find('.minus').exists()).toBe(true)
      expect(rowOf(wrapper, 3).find('.minus').exists()).toBe(false)
      expect(rowOf(wrapper, 1).find('.minus').attributes('aria-label')).toBe('Eén melk minder')
    })

    it('− telt af; een standaardregel op 0 verdwijnt, een receptregel blijft', async () => {
      ;({ wrapper } = await mountApp())

      await rowOf(wrapper, 1).find('.minus').trigger('click')
      await flushPromises()
      expect(lines(wrapper)[0]).toBe('melk')

      await rowOf(wrapper, 1).find('.minus').trigger('click')
      await flushPromises()
      expect(rowOf(wrapper, 1).exists()).toBe(false)

      await rowOf(wrapper, 2).find('.minus').trigger('click')
      await flushPromises()
      expect(lines(wrapper)).toEqual(['200 g bloem', 'zout'])
      expect(rowOf(wrapper, 2).find('.minus').exists()).toBe(false)
    })

    it('afvinken streept de hele regel af, met teller', async () => {
      ;({ wrapper } = await mountApp())

      await rowOf(wrapper, 1).find('input').setValue(false)
      await rowOf(wrapper, 1).find('input').trigger('change')
      await flushPromises()

      expect(rowOf(wrapper, 1).classes()).toContain('checked')
      expect(server.shoppingDb[0]).toMatchObject({ checked: true, standard_count: 2 })
    })
  })
})
