import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AdminView from '../views/AdminView.vue'
import { jsonResponse, mockFetch, authHeaderOf } from './helpers'

const CODE = 'geheime-code-123'

const SOUP = {
  id: 1,
  title: 'Tomatensoep',
  description: 'Lekker.',
  servings: 4,
  status: 'pending',
  created_at: '2026-10-01T12:00:00Z',
}

function mountView() {
  return mount(AdminView, {
    attachTo: document.body,
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
}

function buttonWithText(wrapper, text) {
  return wrapper.findAll('button').find((b) => b.text() === text)
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
    mockFetch(() => jsonResponse([]))
    wrapper = mountView()
    await flushPromises()

    const input = wrapper.find('#admin-code')
    expect(input.attributes('type')).toBe('password')
    expect(wrapper.find('label[for="admin-code"]').text()).toBe('Beheercode')
    expect(document.activeElement).toBe(input.element)
  })

  it('toont een duidelijke melding bij een foute code (401)', async () => {
    mockFetch(() => jsonResponse({ error: 'Unauthorized' }, 401))
    wrapper = mountView()
    await logIn(wrapper, 'fout')

    expect(wrapper.find('[role="alert"]').text()).toBe('Deze code is onjuist.')
    expect(wrapper.find('#admin-code').exists()).toBe(true)
    expect(sessionStorage.getItem('adminCode')).toBeNull()
  })

  it('toont na inloggen de wachtende recepten, met de code alleen in de header', async () => {
    const fetch = mockFetch(() => jsonResponse([SOUP]))
    wrapper = mountView()
    await logIn(wrapper)

    expect(wrapper.find('#admin-code').exists()).toBe(false)
    expect(wrapper.text()).toContain('Tomatensoep')
    expect(wrapper.text()).toContain('4 porties')
    expect(wrapper.text()).toContain('1 oktober 2026')
    expect(authHeaderOf(fetch.mock.calls.at(-1))).toBe(`Bearer ${CODE}`)
    for (const [url] of fetch.mock.calls) expect(url).not.toContain(CODE)
    expect(window.location.href).not.toContain(CODE)
  })

  it('toont een melding als er niets wacht', async () => {
    sessionStorage.setItem('adminCode', CODE)
    mockFetch(() => jsonResponse([]))
    wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Geen recepten om te beoordelen.')
  })

  it('werkt de lijst bij na goedkeuren', async () => {
    sessionStorage.setItem('adminCode', CODE)
    let pending = [SOUP]
    const fetch = mockFetch((method, url) => {
      if (url === '/api/admin/recipes/1/approve') {
        pending = []
        return jsonResponse({ ...SOUP, status: 'approved' })
      }
      return jsonResponse(url.startsWith('/api/admin') ? pending : [])
    })
    wrapper = mountView()
    await flushPromises()

    await buttonWithText(wrapper, 'Goedkeuren').trigger('click')
    await flushPromises()

    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/recipes/1/approve',
      expect.objectContaining({ method: 'PATCH' }),
    )
    expect(wrapper.find('[role="status"]').text()).toBe('"Tomatensoep" is goedgekeurd.')
    expect(wrapper.text()).toContain('Geen recepten om te beoordelen.')
  })

  it('verwijdert pas na bevestiging en noemt de titel', async () => {
    sessionStorage.setItem('adminCode', CODE)
    let pending = [SOUP]
    const fetch = mockFetch((method) => {
      if (method === 'DELETE') {
        pending = []
        return new Response(null, { status: 204 })
      }
      return jsonResponse(pending)
    })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    wrapper = mountView()
    await flushPromises()

    await buttonWithText(wrapper, 'Verwijderen').trigger('click')
    await flushPromises()

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('"Tomatensoep"'))
    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/recipes/1',
      expect.objectContaining({ method: 'DELETE' }),
    )
    expect(wrapper.find('[role="status"]').text()).toBe('"Tomatensoep" is verwijderd.')
    expect(wrapper.text()).toContain('Geen recepten om te beoordelen.')
  })

  it('verwijdert niets als je de bevestiging annuleert', async () => {
    sessionStorage.setItem('adminCode', CODE)
    const fetch = mockFetch(() => jsonResponse([SOUP]))
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    wrapper = mountView()
    await flushPromises()

    await buttonWithText(wrapper, 'Verwijderen').trigger('click')
    await flushPromises()

    expect(fetch.mock.calls.some(([, options]) => options.method === 'DELETE')).toBe(false)
    expect(wrapper.text()).toContain('Tomatensoep')
  })

  it('logt automatisch uit als de code tijdens het werken een 401 krijgt', async () => {
    sessionStorage.setItem('adminCode', CODE)
    mockFetch((method) =>
      method === 'PATCH' ? jsonResponse({ error: 'Unauthorized' }, 401) : jsonResponse([SOUP]),
    )
    wrapper = mountView()
    await flushPromises()

    await buttonWithText(wrapper, 'Afwijzen').trigger('click')
    await flushPromises()

    expect(wrapper.find('#admin-code').exists()).toBe(true)
    expect(wrapper.find('[role="alert"]').text()).toContain('Log opnieuw in')
    expect(sessionStorage.getItem('adminCode')).toBeNull()
  })

  it('wist de code bij uitloggen', async () => {
    sessionStorage.setItem('adminCode', CODE)
    mockFetch(() => jsonResponse([]))
    wrapper = mountView()
    await flushPromises()

    await buttonWithText(wrapper, 'Uitloggen').trigger('click')
    await flushPromises()

    expect(wrapper.find('#admin-code').exists()).toBe(true)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(sessionStorage.getItem('adminCode')).toBeNull()
  })

  it('haalt per tabblad de juiste status op', async () => {
    sessionStorage.setItem('adminCode', CODE)
    const fetch = mockFetch(() => jsonResponse([]))
    wrapper = mountView()
    await flushPromises()

    await buttonWithText(wrapper, 'Afgewezen').trigger('click')
    await flushPromises()
    expect(fetch.mock.calls.at(-1)[0]).toBe('/api/admin/recipes?status=rejected')

    await buttonWithText(wrapper, 'Alles').trigger('click')
    await flushPromises()
    expect(fetch.mock.calls.at(-1)[0]).toBe('/api/admin/recipes')
    expect(wrapper.text()).toContain('Geen recepten in deze categorie.')
  })
})
