import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import { routes } from '../router'
import { jsonResponse, mockFetch } from './helpers'

const CONFLICT = 'Dit recept is intussen door iemand anders gewijzigd. Herlaad en probeer opnieuw.'

const PANCAKES = {
  id: 6,
  title: 'Pannenkoeken',
  description: 'Dun.',
  servings: 4,
  lock_version: 3,
  tags: ['zoet'],
  ingredients: [{ id: 21, name: 'bloem', quantity: 250, unit: 'g', optional: false }],
  steps: [{ id: 11, position: 1, body: 'Beslag maken.' }],
}

// Een nep-server met één recept. patchResponse(body) bepaalt het antwoord op PATCH.
function fakeApi(patchResponse = (body) => jsonResponse({ ...PANCAKES, ...body.recipe })) {
  let current = { ...PANCAKES }
  const fetch = mockFetch((method, url, options) => {
    if (url === '/api/tags') return jsonResponse([{ name: 'zoet', count: 1 }])
    if (url === '/api/recipes/6' && method === 'GET') return jsonResponse(current)
    if (url === '/api/recipes/6' && method === 'PATCH') {
      return patchResponse(JSON.parse(options.body))
    }
    return jsonResponse([])
  })
  return {
    fetch,
    // Alsof iemand anders het recept intussen heeft opgeslagen.
    changeOnServer: (changes) => (current = { ...current, ...changes }),
  }
}

async function mountAt(path) {
  setActivePinia(createPinia())
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push(path)
  const wrapper = mount(RouterView, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

function patchBody(fetch) {
  const patch = fetch.mock.calls.find(([, options]) => options.method === 'PATCH')
  return patch && JSON.parse(patch[1].body)
}

describe('RecipeEditView (bewerken vanaf de receptpagina)', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('is te openen via "Bewerken" op de receptpagina, zonder beheercode', async () => {
    fakeApi()
    const { wrapper, router } = await mountAt('/recepten/6')

    await router.push(wrapper.find('.recipe-actions a.edit').attributes('href'))
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('recipe-edit')
    expect(wrapper.find('h1').text()).toBe('Recept bewerken')
    expect(wrapper.find('#title').element.value).toBe('Pannenkoeken')
    expect(wrapper.findAll('.chip-name').map((c) => c.text())).toEqual(['zoet'])
    expect(wrapper.find('button[type="submit"]').text()).toBe('Opslaan')
  })

  it('stuurt de wijzigingen met lock_version, en toont daarna het recept met een melding', async () => {
    const { fetch } = fakeApi()
    const { wrapper, router } = await mountAt('/recepten/6/bewerken')

    await wrapper.find('#title').setValue('Flensjes')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(patchBody(fetch).recipe).toMatchObject({
      title: 'Flensjes',
      lock_version: 3,
      category_name: '',
      tag_names: ['zoet'],
      recipe_ingredients_attributes: [
        { id: 21, ingredient_name: 'bloem', quantity: '250', unit: 'g', optional: false },
      ],
      steps_attributes: [{ id: 11, body: 'Beslag maken.' }],
    })
    expect(router.currentRoute.value.path).toBe('/recepten/6')
    expect(wrapper.find('[role="status"]').text()).toBe('"Flensjes" is opgeslagen.')
  })

  it('toont bij een 409 de Nederlandse melding en houdt je invoer vast', async () => {
    fakeApi(() => jsonResponse({ error: CONFLICT }, 409))
    const { wrapper, router } = await mountAt('/recepten/6/bewerken')

    await wrapper.find('#title').setValue('Flensjes')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[role="alert"] p').text()).toBe(CONFLICT)
    expect(wrapper.find('#title').element.value).toBe('Flensjes')
    expect(router.currentRoute.value.name).toBe('recipe-edit')
  })

  it('laadt na een 409 de nieuwste versie, na bevestiging', async () => {
    const { changeOnServer } = fakeApi(() => jsonResponse({ error: CONFLICT }, 409))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { wrapper } = await mountAt('/recepten/6/bewerken')
    await wrapper.find('#title').setValue('Flensjes')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    changeOnServer({ title: 'Crêpes', lock_version: 4 })
    await wrapper.find('.reload').trigger('click')
    await flushPromises()

    expect(confirm).toHaveBeenCalled()
    expect(wrapper.find('#title').element.value).toBe('Crêpes')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('toont validatiefouten van de server bij het veld', async () => {
    fakeApi(() => jsonResponse({ errors: { title: ['moet opgegeven zijn'] } }, 422))
    const { wrapper } = await mountAt('/recepten/6/bewerken')

    await wrapper.find('#title').setValue('')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('#title').element.parentElement.textContent).toContain(
      'Titel moet opgegeven zijn',
    )
  })

  it('waarschuwt bij weggaan met niet-opgeslagen wijzigingen', async () => {
    fakeApi()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { wrapper, router } = await mountAt('/recepten/6/bewerken')

    await wrapper.find('#title').setValue('Iets anders')
    await router.push('/')

    expect(confirm).toHaveBeenCalled()
    expect(router.currentRoute.value.name).toBe('recipe-edit')
  })

  it('meldt een recept dat niet (meer) bestaat, bijv. na een verwijderverzoek', async () => {
    mockFetch((method, url) =>
      url === '/api/tags' ? jsonResponse([]) : jsonResponse({ error: 'Recipe not found' }, 404),
    )
    const { wrapper } = await mountAt('/recepten/6/bewerken')

    expect(wrapper.text()).toContain('Dit recept bestaat niet (meer).')
    expect(wrapper.find('form').exists()).toBe(false)
  })
})
