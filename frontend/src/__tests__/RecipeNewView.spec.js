import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import RecipeNewView from '../views/RecipeNewView.vue'

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mountView() {
  return mount(RecipeNewView, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
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
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('stuurt het recept genest onder "recipe", met porties, ingrediënten en stappen', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ id: 7 }, 201)))
    const wrapper = mountView()
    await fillAndSubmit(wrapper)

    const [url, options] = fetch.mock.calls[0]
    expect(url).toBe('/api/recipes')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({
      recipe: {
        title: 'Pannenkoeken',
        description: 'Beslag maken en bakken.',
        servings: '6',
        recipe_ingredients_attributes: [
          { ingredient_name: 'bloem', quantity: '250', unit: 'g', optional: false },
        ],
        steps_attributes: [{ body: 'Beslag maken.' }],
      },
    })
  })

  it('toont na succes een bedankmelding in plaats van het formulier', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ id: 7 }, 201)))
    const wrapper = mountView()
    await fillAndSubmit(wrapper)

    expect(wrapper.text()).toContain('Bedankt! Je recept wacht op goedkeuring.')
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('toont validatiefouten van de server per veld (422)', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            { errors: { title: ["can't be blank"], servings: ['must be greater than 0'] } },
            422,
          ),
        ),
    )
    const wrapper = mountView()
    await fillAndSubmit(wrapper, { title: '', servings: '0' })

    const titleField = wrapper.find('#title').element.parentElement
    const servingsField = wrapper.find('#servings').element.parentElement
    const descriptionField = wrapper.find('#description').element.parentElement
    expect(titleField.textContent).toContain("Titel can't be blank")
    expect(servingsField.textContent).toContain('Porties must be greater than 0')
    expect(descriptionField.querySelector('.error')).toBeNull()
    expect(wrapper.find('#title').attributes('aria-invalid')).toBe('true')
    expect(wrapper.text()).not.toContain('Bedankt!')
  })

  it('toont een melding bij te veel inzendingen (429)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ error: 'Too many submissions' }, 429)),
    )
    const wrapper = mountView()
    await fillAndSubmit(wrapper)

    expect(wrapper.find('[role="alert"]').text()).toBe(
      'Te veel inzendingen. Probeer het later opnieuw.',
    )
    expect(wrapper.find('form').exists()).toBe(true)
  })

  it('toont een fout in een stap bij die stap (422)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ errors: { 'steps[0].body': ['is te kort'] } }, 422)),
    )
    const wrapper = mountView()
    await fillAndSubmit(wrapper)

    expect(wrapper.find('.step-row .error').text()).toBe('Stap is te kort')
    expect(wrapper.find('.general-errors').exists()).toBe(false)
  })
})
