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
  // Een ouder recept, van vóór ingrediënten en stappen.
  ingredients: [],
  steps: [],
}

const PANCAKES = {
  ...SOUP,
  id: 6,
  title: 'Pannenkoeken',
  ingredients: [
    { id: 21, name: 'bloem', quantity: 250, unit: 'g', optional: false },
    { id: 22, name: 'zout', quantity: null, unit: null, optional: false },
  ],
  steps: [
    { id: 11, position: 1, body: 'Beslag maken.' },
    { id: 12, position: 2, body: 'Laten rusten.' },
    { id: 13, position: 3, body: 'Bakken.' },
  ],
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

  it('stuurt voor een ouder recept zonder regels alleen titel, beschrijving en porties', async () => {
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
      recipe: { title: 'Pompoensoep', description: 'Lekker.', servings: '6' },
    })
    expect(router.currentRoute.value.name).toBe('admin')
    expect(wrapper.find('[role="status"]').text()).toBe('"Pompoensoep" is opgeslagen.')
  })

  it('stuurt bewerkte, herschikte, nieuwe en verwijderde regels in één PATCH', async () => {
    const fetch = mockFetch((method, url) => {
      if (method === 'PATCH') return jsonResponse(PANCAKES)
      return jsonResponse(url === '/api/admin/recipes/6' ? PANCAKES : [])
    })
    const { wrapper, router } = await mountAt('/beheer/recepten/6/bewerken')
    const steps = () => wrapper.findAll('.step-row')

    // "Laten rusten." weg, "Bakken." naar boven, "Beslag maken." aanpassen, stap erbij.
    await steps()[1].find('.remove').trigger('click')
    await steps()[1].find('.up').trigger('click')
    await steps()[1].find('textarea').setValue('Beslag maken met melk.')
    await wrapper.find('.steps .add').trigger('click')
    await steps()[2].find('textarea').setValue('Opdienen.')
    // Zout weg, bloem aanpassen.
    await wrapper.findAll('.ingredient-row')[1].find('.remove').trigger('click')
    await wrapper.find('.ingredient-row .quantity').setValue('300')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const patch = fetch.mock.calls.find(([, options]) => options.method === 'PATCH')
    expect(patch[0]).toBe('/api/admin/recipes/6')
    expect(JSON.parse(patch[1].body)).toEqual({
      recipe: {
        title: 'Pannenkoeken',
        description: 'Lekker.',
        servings: '4',
        recipe_ingredients_attributes: [
          { id: 21, ingredient_name: 'bloem', quantity: '300', unit: 'g', optional: false },
          { id: 22, _destroy: true },
        ],
        steps_attributes: [
          { id: 13, body: 'Bakken.' },
          { id: 11, body: 'Beslag maken met melk.' },
          { body: 'Opdienen.' },
          { id: 12, _destroy: true },
        ],
      },
    })
    expect(router.currentRoute.value.name).toBe('admin')
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

  it('waarschuwt ook als alleen de volgorde van de stappen is gewijzigd', async () => {
    mockFetch(() => jsonResponse(PANCAKES))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { wrapper, router } = await mountAt('/beheer/recepten/6/bewerken')

    await wrapper.findAll('.step-row')[2].find('.up').trigger('click')
    await router.push('/')

    expect(confirm).toHaveBeenCalledWith('Je hebt niet-opgeslagen wijzigingen. Toch weggaan?')
    expect(router.currentRoute.value.name).toBe('admin-recipe-edit')
  })

  it('waarschuwt ook als alleen een ingrediënt is gewijzigd', async () => {
    mockFetch(() => jsonResponse(PANCAKES))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { wrapper, router } = await mountAt('/beheer/recepten/6/bewerken')

    await wrapper.find('.ingredient-row .name').setValue('volkorenmeel')
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
