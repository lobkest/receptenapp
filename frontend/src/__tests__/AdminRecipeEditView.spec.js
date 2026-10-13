import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import { routes, requireAdmin } from '../router'
import { jsonResponse, mockFetch, authHeaderOf } from './helpers'

const CODE = 'geheime-code-123'

const SOUP = {
  id: 5,
  title: 'Tomatensoep',
  description: 'Lekker.',
  servings: 4,
  status: 'rejected',
  created_at: '2026-10-01T12:00:00Z',
}

// Een echte router (in het geheugen), omdat de view useRouter en
// onBeforeRouteLeave gebruikt.
async function mountAt(path) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({ history: createMemoryHistory(), routes })
  router.beforeEach(requireAdmin)
  await router.push(path)
  const wrapper = mount(RouterView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router }
}

describe('AdminRecipeEditView', () => {
  beforeEach(() => {
    sessionStorage.clear()
    sessionStorage.setItem('adminCode', CODE)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('laadt het recept via de admin-API en vult het formulier', async () => {
    const fetch = mockFetch(() => jsonResponse(SOUP))
    const { wrapper } = await mountAt('/beheer/recepten/5/bewerken')

    expect(fetch.mock.calls[0][0]).toBe('/api/admin/recipes/5')
    expect(wrapper.find('#title').element.value).toBe('Tomatensoep')
    expect(wrapper.find('#servings').element.value).toBe('4')
    expect(wrapper.find('button[type="submit"]').text()).toBe('Opslaan')
  })

  it('stuurt een PATCH met alleen titel, beschrijving en porties, en gaat terug naar beheer', async () => {
    const fetch = mockFetch((method, url) => {
      if (method === 'PATCH') return jsonResponse({ ...SOUP, title: 'Pompoensoep' })
      return jsonResponse(url === '/api/admin/recipes/5' ? SOUP : [])
    })
    const { wrapper, router } = await mountAt('/beheer/recepten/5/bewerken')

    await wrapper.find('#title').setValue('Pompoensoep')
    await wrapper.find('#servings').setValue('6')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const patch = fetch.mock.calls.find(([, options]) => options.method === 'PATCH')
    expect(patch[0]).toBe('/api/admin/recipes/5')
    expect(authHeaderOf(patch)).toBe(`Bearer ${CODE}`)
    expect(JSON.parse(patch[1].body)).toEqual({
      recipe: { title: 'Pompoensoep', description: 'Lekker.', servings: 6 },
    })
    expect(router.currentRoute.value.name).toBe('admin')
    expect(wrapper.find('[role="status"]').text()).toBe('"Pompoensoep" is opgeslagen.')
  })

  it('toont 422-fouten per veld en blijft op de pagina', async () => {
    mockFetch((method) =>
      method === 'PATCH'
        ? jsonResponse({ errors: { title: ["can't be blank"] } }, 422)
        : jsonResponse(SOUP),
    )
    const { wrapper, router } = await mountAt('/beheer/recepten/5/bewerken')

    await wrapper.find('#title').setValue('')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const titleField = wrapper.find('#title').element.parentElement
    expect(titleField.textContent).toContain("Titel can't be blank")
    expect(wrapper.find('#servings').element.parentElement.querySelector('.error')).toBeNull()
    expect(router.currentRoute.value.name).toBe('admin-recipe-edit')
  })

  it('waarschuwt bij weggaan met niet-opgeslagen wijzigingen', async () => {
    mockFetch(() => jsonResponse(SOUP))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { wrapper, router } = await mountAt('/beheer/recepten/5/bewerken')

    await wrapper.find('#title').setValue('Iets anders')
    await router.push('/')

    expect(confirm).toHaveBeenCalled()
    expect(router.currentRoute.value.name).toBe('admin-recipe-edit')
  })

  it('vraagt niets bij weggaan zonder wijzigingen', async () => {
    mockFetch(() => jsonResponse([]))
    const confirm = vi.spyOn(window, 'confirm')
    const { router } = await mountAt('/beheer/recepten/5/bewerken')

    await router.push('/')

    expect(confirm).not.toHaveBeenCalled()
    expect(router.currentRoute.value.name).toBe('recipes')
  })

  it('stuurt bij een 401 terug naar het inlogscherm', async () => {
    mockFetch(() => jsonResponse({ error: 'Unauthorized' }, 401))
    const { wrapper, router } = await mountAt('/beheer/recepten/5/bewerken')

    expect(router.currentRoute.value.name).toBe('admin')
    expect(wrapper.find('#admin-code').exists()).toBe(true)
    expect(wrapper.find('[role="alert"]').text()).toContain('Log opnieuw in')
  })
})
