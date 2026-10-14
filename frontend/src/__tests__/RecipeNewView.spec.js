import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import { routes } from '../router'
import { jsonResponse, mockFetch } from './helpers'

const TAGS = [
  { name: 'snel', count: 3 },
  { name: 'vega', count: 2 },
]

// /api/tags geeft altijd TAGS; het toevoegen (POST /api/recipes) krijgt submitResponse().
// Na toevoegen opent de receptpagina: GET /api/recipes/7 geeft dan het nieuwe recept.
const CREATED = { id: 7, title: 'Pannenkoeken', servings: 6, ingredients: [], steps: [] }

function fakeApi(submitResponse) {
  return mockFetch((method, url) => {
    if (url === '/api/tags') return jsonResponse(TAGS)
    if (method === 'GET') return jsonResponse(CREATED)
    return submitResponse()
  })
}

function postedRecipe(fetch) {
  const post = fetch.mock.calls.find(([, options]) => options.method === 'POST')
  return post && { url: post[0], body: JSON.parse(post[1].body) }
}

let router

async function mountView() {
  router = createRouter({ history: createMemoryHistory(), routes })
  await router.push('/recepten/nieuw')
  const wrapper = mount(RouterView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

async function fillAndSubmit(wrapper, { title = 'Pannenkoeken', servings = '6' } = {}) {
  await wrapper.find('#title').setValue(title)
  await wrapper.find('#description').setValue('Beslag maken en bakken.')
  await wrapper.find('#servings').setValue(servings)
  await wrapper.find('.ingredient-row .quantity').setValue('250')
  await wrapper.find('.ingredient-row .name').setValue('bloem')
  await wrapper.find('.step-row textarea').setValue('Beslag maken.')
  await wrapper.find('form').trigger('submit')
  await flushPromises()
}

describe('RecipeNewView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('stuurt het recept genest onder "recipe", met porties, tags, ingrediënten en stappen', async () => {
    const fetch = fakeApi(() => jsonResponse(CREATED, 201))
    const wrapper = await mountView()
    await fillAndSubmit(wrapper)

    const { url, body } = postedRecipe(fetch)
    expect(url).toBe('/api/recipes')
    expect(body).toEqual({
      recipe: {
        title: 'Pannenkoeken',
        description: 'Beslag maken en bakken.',
        servings: '6',
        tag_names: [],
        recipe_ingredients_attributes: [
          { ingredient_name: 'bloem', quantity: '250', unit: 'g', optional: false },
        ],
        steps_attributes: [{ body: 'Beslag maken.' }],
      },
    })
  })

  it('biedt de bestaande tags uit /api/tags aan en stuurt de gekozen tags mee', async () => {
    const fetch = fakeApi(() => jsonResponse(CREATED, 201))
    const wrapper = await mountView()

    const options = wrapper.findAll('.tag-select option').map((o) => o.text())
    expect(options).toEqual(['Kies een tag…', 'snel', 'vega', 'Nieuwe tag…'])

    await wrapper.find('.tag-select').setValue('vega')
    await wrapper.find('.tag-select').setValue('NEW')
    await wrapper.find('.new-tag-input').setValue('Glutenvrij')
    await wrapper.find('.new-tag-add').trigger('click')
    await fillAndSubmit(wrapper)

    expect(postedRecipe(fetch).body.recipe.tag_names).toEqual(['vega', 'glutenvrij'])
  })

  it('kan zonder /api/tags gewoon insturen, met alleen nieuwe tags', async () => {
    const fetch = mockFetch((method, url) =>
      url === '/api/tags' ? jsonResponse({}, 500) : jsonResponse(CREATED, 201),
    )
    const wrapper = await mountView()

    expect(wrapper.findAll('.tag-select option').map((o) => o.text())).toEqual([
      'Kies een tag…',
      'Nieuwe tag…',
    ])
    await fillAndSubmit(wrapper)
    expect(postedRecipe(fetch)).toBeDefined()
  })

  it('heet "Recept toevoegen" en gaat na toevoegen meteen naar het nieuwe recept', async () => {
    fakeApi(() => jsonResponse(CREATED, 201))
    const wrapper = await mountView()
    expect(wrapper.find('h1').text()).toBe('Recept toevoegen')
    expect(wrapper.find('button[type="submit"]').text()).toBe('Recept toevoegen')

    await fillAndSubmit(wrapper)
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/recepten/7')
    expect(wrapper.find('[role="status"]').text()).toBe('"Pannenkoeken" is toegevoegd.')
    expect(wrapper.find('h1').text()).toBe('Pannenkoeken')
  })

  it('toont validatiefouten van de server per veld (422)', async () => {
    fakeApi(() =>
      jsonResponse(
        {
          errors: {
            title: ['moet opgegeven zijn'],
            servings: ['moet groter zijn dan 0'],
            tag_names: ['heeft te veel tags (maximaal 10)'],
          },
        },
        422,
      ),
    )
    const wrapper = await mountView()
    await fillAndSubmit(wrapper, { title: '', servings: '0' })

    const titleField = wrapper.find('#title').element.parentElement
    const servingsField = wrapper.find('#servings').element.parentElement
    const descriptionField = wrapper.find('#description').element.parentElement
    expect(titleField.textContent).toContain('Titel moet opgegeven zijn')
    expect(servingsField.textContent).toContain('Porties moet groter zijn dan 0')
    expect(wrapper.find('.tags .error').text()).toBe('Tags heeft te veel tags (maximaal 10)')
    expect(descriptionField.querySelector('.error')).toBeNull()
    expect(wrapper.find('#title').attributes('aria-invalid')).toBe('true')
    expect(wrapper.find('.general-errors').exists()).toBe(false)
    expect(router.currentRoute.value.path).toBe('/recepten/nieuw')
  })

  it('toont een melding bij te veel inzendingen (429)', async () => {
    fakeApi(() => jsonResponse({ error: 'Too many submissions' }, 429))
    const wrapper = await mountView()
    await fillAndSubmit(wrapper)

    expect(wrapper.find('[role="alert"]').text()).toBe(
      'Te veel verzoeken. Probeer het later opnieuw.',
    )
    expect(wrapper.find('form').exists()).toBe(true)
  })

  it('toont een fout in een stap bij die stap (422)', async () => {
    fakeApi(() => jsonResponse({ errors: { 'steps[0].body': ['is te kort'] } }, 422))
    const wrapper = await mountView()
    await fillAndSubmit(wrapper)

    expect(wrapper.find('.step-row .error').text()).toBe('Stap is te kort')
    expect(wrapper.find('.general-errors').exists()).toBe(false)
  })
})
