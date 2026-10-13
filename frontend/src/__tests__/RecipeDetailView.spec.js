import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import { routes } from '../router'
import { jsonResponse, mockFetch } from './helpers'

const SOUP = { id: 5, title: 'Tomatensoep', description: 'Lekker.', servings: 4 }

async function mountAt(path) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push(path)
  const wrapper = mount(RouterView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router }
}

describe('RecipeDetailView', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('toont geen beheerknoppen voor gewone bezoekers', async () => {
    mockFetch(() => jsonResponse(SOUP))
    const { wrapper } = await mountAt('/recepten/5')

    expect(wrapper.text()).toContain('Tomatensoep')
    expect(wrapper.find('.admin-actions').exists()).toBe(false)
  })

  it('toont Bewerken en Verwijderen als je ingelogd bent', async () => {
    sessionStorage.setItem('adminCode', 'geheim')
    mockFetch(() => jsonResponse(SOUP))
    const { wrapper } = await mountAt('/recepten/5')

    const actions = wrapper.find('.admin-actions')
    expect(actions.find('a').attributes('href')).toBe('/beheer/recepten/5/bewerken')
    expect(actions.find('button').text()).toBe('Verwijderen')
  })

  it('verwijdert na bevestiging en gaat naar beheer', async () => {
    sessionStorage.setItem('adminCode', 'geheim')
    const fetch = mockFetch((method, url) => {
      if (method === 'DELETE') return new Response(null, { status: 204 })
      return jsonResponse(url === '/api/recipes/5' ? SOUP : [])
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { wrapper, router } = await mountAt('/recepten/5')

    await wrapper.find('.admin-actions button').trigger('click')
    await flushPromises()

    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/recipes/5',
      expect.objectContaining({ method: 'DELETE' }),
    )
    expect(router.currentRoute.value.name).toBe('admin')
    expect(wrapper.find('[role="status"]').text()).toBe('"Tomatensoep" is verwijderd.')
  })

  it('toont ingrediënten en genummerde stappen', async () => {
    mockFetch(() =>
      jsonResponse({
        ...SOUP,
        ingredients: [
          { id: 1, name: 'bloem', quantity: 200, unit: 'g', note: null },
          { id: 2, name: 'ei', quantity: 2, unit: 'stuks', note: null },
          { id: 3, name: 'olie', quantity: 0.5, unit: 'ml', note: null },
          { id: 4, name: 'ui', quantity: 1, unit: 'stuks', note: 'fijngesneden' },
          { id: 5, name: 'zout', quantity: null, unit: null, note: null },
        ],
        steps: [
          { id: 11, position: 1, body: 'Snijden.' },
          { id: 12, position: 2, body: 'Koken.' },
        ],
      }),
    )
    const { wrapper } = await mountAt('/recepten/5')

    expect(wrapper.findAll('.ingredients li').map((li) => li.text())).toEqual([
      '200 g bloem',
      '2 stuks ei',
      '0,5 ml olie',
      '1 stuks ui, fijngesneden',
      'zout — naar smaak',
    ])
    expect(wrapper.find('.steps ol').exists()).toBe(true)
    expect(wrapper.findAll('.steps ol li').map((li) => li.text())).toEqual(['Snijden.', 'Koken.'])
  })

  it('toont bij een ouder recept zonder ingrediënten en stappen geen lege kopjes', async () => {
    mockFetch(() => jsonResponse({ ...SOUP, ingredients: [], steps: [] }))
    const { wrapper } = await mountAt('/recepten/5')

    expect(wrapper.text()).toContain('Lekker.')
    expect(wrapper.find('.ingredients').exists()).toBe(false)
    expect(wrapper.find('.steps').exists()).toBe(false)
  })
})
