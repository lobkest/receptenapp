import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AdminView from '../views/AdminView.vue'
import { jsonResponse, mockFetch, authHeaderOf } from './helpers'
import { buttonWithText } from './mount'

const CODE = 'geheime-code-123'

const REQUESTS = [
  {
    id: 1,
    title: 'Tomatensoep',
    deletion_requested_at: '2026-10-15T09:30:00Z',
    deletion_reason: 'staat er dubbel in',
    type: 'recipe',
  },
  {
    id: 2,
    title: 'Snert',
    deletion_requested_at: '2026-10-14T18:00:00Z',
    deletion_reason: null,
    type: 'recipe',
  },
]

// Een variatie met hetzelfde id als een recept: de soort hoort bij de sleutel.
const VARIATION_REQUEST = {
  id: 1,
  title: 'Met kip',
  deletion_requested_at: '2026-10-15T10:00:00Z',
  deletion_reason: 'smaakt niet',
  type: 'variation',
  recipe_id: 4,
  recipe_title: 'Curry',
}

// Een nep-beheer-API: verzoeken lijst, terugzetten en definitief verwijderen, voor
// recepten (/api/admin/recipes) en variaties (/api/admin/variations).
// db is de lijst met verzoeken; tests kunnen erin kijken.
function fakeAdminApi(initial = REQUESTS) {
  const db = initial.map((request) => ({ ...request }))
  const fetch = mockFetch((method, url, options) => {
    if (options.headers?.Authorization !== `Bearer ${CODE}`) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }
    if (url === '/api/admin/deletion_requests') return jsonResponse(db)
    const match = url.match(/^\/api\/admin\/(recipes|variations)\/(\d+)(\/restore)?$/)
    const type = match?.[1] === 'variations' ? 'variation' : 'recipe'
    const index = db.findIndex((r) => r.type === type && r.id === Number(match?.[2]))
    if (index === -1) return jsonResponse({ error: 'Not found' }, 404)
    const [request] = db.splice(index, 1)
    if (method === 'DELETE') return new Response(null, { status: 204 })
    return jsonResponse({ id: request.id, title: request.title })
  })
  return { db, fetch }
}

function mountView() {
  return mount(AdminView, {
    attachTo: document.body,
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
}

function cardOf(wrapper, title) {
  return wrapper.findAll('.requests li').find((li) => li.find('h3').text() === title)
}

async function logIn(wrapper, code = CODE) {
  await wrapper.find('#admin-code').setValue(code)
  await wrapper.find('form').trigger('submit')
  await flushPromises()
}

describe('AdminView', () => {
  let wrapper

  beforeEach(() => {
    sessionStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    wrapper?.unmount()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('toont een inlogveld met label, type="password" en focus', async () => {
    fakeAdminApi()
    wrapper = mountView()
    await flushPromises()

    const input = wrapper.find('#admin-code')
    expect(input.attributes('type')).toBe('password')
    expect(wrapper.find('label[for="admin-code"]').text()).toBe('Beheercode')
    expect(document.activeElement).toBe(input.element)
  })

  it('toont een duidelijke melding bij een foute code (401)', async () => {
    fakeAdminApi()
    wrapper = mountView()
    await logIn(wrapper, 'fout')

    expect(wrapper.find('[role="alert"]').text()).toBe('Deze code is onjuist.')
    expect(wrapper.find('#admin-code').exists()).toBe(true)
    expect(sessionStorage.getItem('adminCode')).toBeNull()
  })

  it('toont de melding van de server bij te veel pogingen (429), zonder in te loggen', async () => {
    const message = 'Te veel pogingen. Wacht een minuut en probeer het opnieuw.'
    mockFetch(() => jsonResponse({ error: message }, 429))
    wrapper = mountView()
    await logIn(wrapper)

    expect(wrapper.find('[role="alert"]').text()).toBe(message)
    expect(wrapper.find('#admin-code').exists()).toBe(true)
    expect(sessionStorage.getItem('adminCode')).toBeNull()
  })

  it('blijft ingelogd bij een 429 tijdens het werken, en toont de melding', async () => {
    const message = 'Te veel pogingen. Wacht een minuut en probeer het opnieuw.'
    const { fetch } = fakeAdminApi()
    wrapper = mountView()
    await logIn(wrapper)
    fetch.mockImplementation(async () => jsonResponse({ error: message }, 429))

    await buttonWithText(cardOf(wrapper, 'Tomatensoep'), 'Terugzetten').trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toBe(message)
    expect(sessionStorage.getItem('adminCode')).toBe(CODE)
  })

  it('toont na inloggen de verwijderverzoeken met datum en reden, code alleen in de header', async () => {
    const { fetch } = fakeAdminApi()
    wrapper = mountView()
    await logIn(wrapper)

    expect(wrapper.findAll('.requests h3').map((h) => h.text())).toEqual(['Tomatensoep', 'Snert'])
    expect(cardOf(wrapper, 'Tomatensoep').find('.reason').text()).toBe('Reden: staat er dubbel in')
    expect(cardOf(wrapper, 'Snert').find('.reason').text()).toBe('Geen reden opgegeven.')
    expect(cardOf(wrapper, 'Tomatensoep').find('time').attributes('datetime')).toBe(
      '2026-10-15T09:30:00Z',
    )
    expect(authHeaderOf(fetch.mock.calls.at(-1))).toBe(`Bearer ${CODE}`)
    for (const [url] of fetch.mock.calls) expect(url).not.toContain(CODE)
  })

  it('heeft per verzoek een link naar de versies', async () => {
    sessionStorage.setItem('adminCode', CODE)
    fakeAdminApi()
    wrapper = mountView()
    await flushPromises()

    const link = cardOf(wrapper, 'Snert').findComponent(RouterLinkStub)
    expect(link.props('to')).toEqual({ name: 'admin-recipe-versions', params: { id: 2 } })
  })

  it('toont een melding als er geen verzoeken zijn', async () => {
    sessionStorage.setItem('adminCode', CODE)
    fakeAdminApi([])
    wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('.empty').text()).toBe('Geen verwijderverzoeken.')
  })

  it('zet een recept terug: weg uit de lijst, met bevestiging', async () => {
    sessionStorage.setItem('adminCode', CODE)
    const { fetch } = fakeAdminApi()
    wrapper = mountView()
    await flushPromises()

    await cardOf(wrapper, 'Tomatensoep').find('.restore').trigger('click')
    await flushPromises()

    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/recipes/1/restore',
      expect.objectContaining({ method: 'PATCH' }),
    )
    expect(wrapper.find('[role="status"]').text()).toBe(
      '"Tomatensoep" is teruggezet en weer zichtbaar.',
    )
    expect(wrapper.findAll('.requests h3').map((h) => h.text())).toEqual(['Snert'])
  })

  it('verwijdert pas definitief na bevestiging in het venster', async () => {
    sessionStorage.setItem('adminCode', CODE)
    const { db, fetch } = fakeAdminApi()
    wrapper = mountView()
    await flushPromises()
    const dialog = () => wrapper.find('dialog')

    await cardOf(wrapper, 'Snert').find('.destroy').trigger('click')
    await flushPromises()
    expect(dialog().find('h2').text()).toBe('"Snert" definitief verwijderen?')
    expect(document.activeElement).toBe(dialog().find('.cancel').element)

    await dialog().find('.cancel').trigger('click')
    await flushPromises()
    expect(db).toHaveLength(2)
    expect(fetch.mock.calls.some(([, o]) => o.method === 'DELETE')).toBe(false)

    await cardOf(wrapper, 'Snert').find('.destroy').trigger('click')
    await flushPromises()
    expect(dialog().find('.confirm').text()).toBe('Definitief verwijderen')
    await dialog().find('.confirm').trigger('click')
    await flushPromises()

    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/recipes/2',
      expect.objectContaining({ method: 'DELETE' }),
    )
    expect(wrapper.find('[role="status"]').text()).toBe('"Snert" is definitief verwijderd.')
    expect(wrapper.findAll('.requests h3').map((h) => h.text())).toEqual(['Tomatensoep'])
  })

  it('logt automatisch uit als de code tijdens het werken een 401 krijgt', async () => {
    sessionStorage.setItem('adminCode', CODE)
    let valid = true
    mockFetch(() => (valid ? jsonResponse(REQUESTS) : jsonResponse({ error: 'Unauthorized' }, 401)))
    wrapper = mountView()
    await flushPromises()

    valid = false
    await cardOf(wrapper, 'Snert').find('.restore').trigger('click')
    await flushPromises()

    expect(wrapper.find('#admin-code').exists()).toBe(true)
    expect(wrapper.find('[role="alert"]').text()).toBe(
      'Je code is niet (meer) geldig. Log opnieuw in.',
    )
    expect(sessionStorage.getItem('adminCode')).toBeNull()
  })

  it('wist de code bij uitloggen', async () => {
    sessionStorage.setItem('adminCode', CODE)
    fakeAdminApi()
    wrapper = mountView()
    await flushPromises()

    await buttonWithText(wrapper, 'Uitloggen').trigger('click')
    await flushPromises()

    expect(wrapper.find('#admin-code').exists()).toBe(true)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(sessionStorage.getItem('adminCode')).toBeNull()
  })

  it('heeft geen goedkeur-tabbladen meer', async () => {
    sessionStorage.setItem('adminCode', CODE)
    fakeAdminApi()
    wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('.tabs').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Goedkeuren')
  })

  describe('variaties', () => {
    async function mountWithVariation() {
      sessionStorage.setItem('adminCode', CODE)
      const api = fakeAdminApi([VARIATION_REQUEST, ...REQUESTS])
      wrapper = mountView()
      await flushPromises()
      return api
    }

    it('staan in dezelfde lijst, gelabeld als variatie met de receptnaam, zonder Versies', async () => {
      await mountWithVariation()

      const card = wrapper.find('.requests li.variation')
      expect(card.find('.kind').text()).toBe('Variatie op Curry')
      expect(card.findComponent(RouterLinkStub).props('to')).toEqual({
        name: 'recipe',
        params: { id: 4 },
      })
      expect(card.find('h3').text()).toBe('Met kip')
      expect(card.find('.reason').text()).toBe('Reden: smaakt niet')
      expect(card.find('.versions').exists()).toBe(false)
      // Het recept met hetzelfde id is een eigen kaart.
      expect(wrapper.findAll('.requests li')).toHaveLength(3)
    })

    it('Terugzetten gaat naar /api/admin/variations/1/restore', async () => {
      const { fetch, db } = await mountWithVariation()

      await wrapper.find('.requests li.variation .restore').trigger('click')
      await flushPromises()

      const call = fetch.mock.calls.find(([, o]) => o.method === 'PATCH')
      expect(call[0]).toBe('/api/admin/variations/1/restore')
      expect(wrapper.find('[role="status"]').text()).toBe(
        '"Met kip" (variatie op Curry) is teruggezet en weer zichtbaar.',
      )
      expect(db.map((r) => r.type)).toEqual(['recipe', 'recipe'])
    })

    it('Definitief verwijderen vraagt eerst om bevestiging', async () => {
      const { fetch } = await mountWithVariation()

      await wrapper.find('.requests li.variation .destroy').trigger('click')
      await flushPromises()
      const dialog = wrapper.find('dialog')
      expect(dialog.find('h2').text()).toBe('"Met kip" (variatie op Curry) definitief verwijderen?')
      await dialog.find('.confirm').trigger('click')
      await flushPromises()

      const call = fetch.mock.calls.find(([, o]) => o.method === 'DELETE')
      expect(call[0]).toBe('/api/admin/variations/1')
      expect(authHeaderOf(call)).toBe(`Bearer ${CODE}`)
      expect(wrapper.findAll('.requests h3').map((h) => h.text())).toEqual(['Tomatensoep', 'Snert'])
    })
  })
})
