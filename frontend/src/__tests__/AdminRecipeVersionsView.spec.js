import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import { routes, requireAdmin } from '../router'
import { jsonResponse, mockFetch, authHeaderOf } from './helpers'

const CODE = 'geheim'

const VERSIONS = {
  recipe: { id: 6, title: 'Pannenkoeken', deletion_requested_at: null },
  versions: [
    { id: 13, created_at: '2026-10-15T10:00:00Z', summary: 'Gewijzigd: titel', current: true },
    {
      id: 12,
      created_at: '2026-10-14T10:00:00Z',
      summary: 'Gewijzigd: ingrediënten',
      current: false,
    },
    { id: 11, created_at: '2026-10-13T10:00:00Z', summary: 'Eerste versie', current: false },
  ],
}

function fakeAdminApi() {
  let data = structuredClone(VERSIONS)
  const fetch = mockFetch((method, url) => {
    if (url === '/api/admin/recipes/6/versions') return jsonResponse(data)
    const match = url.match(/^\/api\/admin\/recipes\/6\/versions\/(\d+)\/restore$/)
    if (match && method === 'POST') {
      const restored = data.versions.find((v) => v.id === Number(match[1]))
      data = {
        ...data,
        versions: [
          {
            id: 14,
            created_at: '2026-10-15T11:00:00Z',
            summary: `Teruggezet naar de versie van ${restored.id}`,
            current: true,
          },
          ...data.versions.map((v) => ({ ...v, current: false })),
        ],
      }
      return jsonResponse({ id: 6, title: 'Pannenkoeken' })
    }
    return jsonResponse([])
  })
  return fetch
}

async function mountAt(path) {
  setActivePinia(createPinia())
  const router = createRouter({ history: createMemoryHistory(), routes })
  router.beforeEach(requireAdmin)
  await router.push(path)
  const wrapper = mount(RouterView, { global: { plugins: [router] }, attachTo: document.body })
  await flushPromises()
  return { wrapper, router }
}

function cards(wrapper) {
  return wrapper.findAll('.versions li')
}

describe('AdminRecipeVersionsView', () => {
  let wrapper

  beforeEach(() => {
    sessionStorage.clear()
    sessionStorage.setItem('adminCode', CODE)
  })

  afterEach(() => {
    wrapper?.unmount()
    vi.unstubAllGlobals()
  })

  it('toont de versies, nieuwste eerst, met samenvatting; de huidige zonder terugzetknop', async () => {
    const fetch = fakeAdminApi()
    ;({ wrapper } = await mountAt('/beheer/recepten/6/versies'))

    expect(authHeaderOf(fetch.mock.calls[0])).toBe(`Bearer ${CODE}`)
    expect(wrapper.find('.recipe-title').text()).toBe('Pannenkoeken')
    expect(cards(wrapper).map((c) => c.find('.summary').text())).toEqual([
      'Gewijzigd: titel',
      'Gewijzigd: ingrediënten',
      'Eerste versie',
    ])
    expect(cards(wrapper)[0].find('.current').text()).toBe('Huidige versie')
    expect(cards(wrapper)[0].find('.restore').exists()).toBe(false)
    expect(cards(wrapper)[1].find('.restore').text()).toBe('Deze versie terugzetten')
  })

  it('zet een versie pas terug na bevestiging, en toont dan de nieuwe versie bovenaan', async () => {
    const fetch = fakeAdminApi()
    ;({ wrapper } = await mountAt('/beheer/recepten/6/versies'))
    const dialog = () => wrapper.find('dialog')

    await cards(wrapper)[2].find('.restore').trigger('click')
    await flushPromises()
    expect(dialog().find('h2').text()).toBe('Deze versie terugzetten?')
    expect(document.activeElement).toBe(dialog().find('.cancel').element)
    await dialog().find('.cancel').trigger('click')
    await flushPromises()
    expect(fetch.mock.calls.some(([, o]) => o.method === 'POST')).toBe(false)

    await cards(wrapper)[2].find('.restore').trigger('click')
    await flushPromises()
    await dialog().find('.confirm').trigger('click')
    await flushPromises()

    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/recipes/6/versions/11/restore',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(wrapper.find('[role="status"]').text()).toContain('is teruggezet.')
    expect(cards(wrapper)).toHaveLength(4)
    expect(cards(wrapper)[0].find('.summary').text()).toBe('Teruggezet naar de versie van 11')
  })

  it('stuurt je zonder beheercode naar het inlogscherm', async () => {
    sessionStorage.clear()
    fakeAdminApi()
    let router
    ;({ wrapper, router } = await mountAt('/beheer/recepten/6/versies'))

    expect(router.currentRoute.value.name).toBe('admin')
  })
})
