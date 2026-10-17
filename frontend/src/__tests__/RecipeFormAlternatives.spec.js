import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import RecipeForm from '../components/RecipeForm.vue'
import { jsonResponse, mockFetch } from './helpers'

// "+ alternatief" per ingrediëntregel in het recept-formulier (bewerken en insturen).
const EXISTING = {
  title: 'Wok',
  servings: 2,
  ingredients: [
    {
      id: 12,
      name: 'kip',
      quantity: 250,
      unit: 'g',
      optional: false,
      alternatives: [
        {
          id: 3,
          name: 'tofu',
          quantity: null,
          unit: null,
          effective_quantity: 250,
          effective_unit: 'g',
        },
        {
          id: 4,
          name: 'tempeh',
          quantity: 0.5,
          unit: 'stuks',
          effective_quantity: 0.5,
          effective_unit: 'stuks',
        },
      ],
    },
    { id: 13, name: 'rijst', quantity: 150, unit: 'g', optional: false, alternatives: [] },
  ],
  steps: [{ id: 1, body: 'Bakken.' }],
}

function rows(wrapper) {
  return wrapper.findAll('.ingredient-row')
}

async function submit(wrapper) {
  await wrapper.find('form').trigger('submit')
  const events = wrapper.emitted('submit')
  return events[events.length - 1][0]
}

describe('RecipeForm: alternatieven', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('toont onder de naam van een alternatief dezelfde suggestie als bij een ingrediënt', async () => {
    // De namen worden één keer per bezoek opgehaald (useIngredientNames).
    mockFetch(() => jsonResponse([{ id: 1, name: 'zoete aardappel' }]))
    const wrapper = mount(RecipeForm)
    await flushPromises()
    const row = rows(wrapper)[0]
    await row.find('.add-alternative').trigger('click')
    await row.find('.alt-name').setValue('zoete aardappelen')

    const suggestion = row.find('.alternative .ingredient-suggestion')
    expect(suggestion.text()).toBe('Bedoel je: zoete aardappel?')
    await suggestion.find('button').trigger('click')
    expect(row.find('.alt-name').element.value).toBe('zoete aardappel')
  })

  it('is ingeklapt: alleen een "+ alternatief"-knop per regel', () => {
    const wrapper = mount(RecipeForm)

    expect(rows(wrapper)[0].find('.add-alternative').text()).toBe('+ alternatief')
    expect(wrapper.findAll('.alternative')).toHaveLength(0)
  })

  it('nieuw recept: alternatief met en zonder eigen hoeveelheid gaat mee bij de regel', async () => {
    const wrapper = mount(RecipeForm)
    const row = rows(wrapper)[0]
    await row.find('.name').setValue('kip')
    await row.find('.quantity').setValue('250')
    await row.find('.unit').setValue('g')

    await row.find('.add-alternative').trigger('click')
    await row.find('.add-alternative').trigger('click')
    await row.find('.add-alternative').trigger('click')
    const [tofu, tempeh] = row.findAll('.alternative')
    // Placeholder en eenheid van het origineel; zonder hoeveelheid is de eenheid uit.
    expect(tofu.find('.alt-quantity').attributes('placeholder')).toBe('zelfde als origineel')
    expect(tofu.find('.alt-unit').element.value).toBe('g')
    expect(tofu.find('.alt-unit').attributes('disabled')).toBeDefined()
    await tofu.find('.alt-name').setValue('tofu')
    await tempeh.find('.alt-name').setValue('tempeh')
    await tempeh.find('.alt-quantity').setValue('0,5')
    await tempeh.find('.alt-unit').setValue('stuks')
    expect(tempeh.find('.alt-unit').attributes('disabled')).toBeUndefined()

    const body = await submit(wrapper)

    // De derde (leeg) gaat niet mee.
    expect(body.recipe_ingredients_attributes[0]).toEqual({
      ingredient_name: 'kip',
      quantity: '250',
      unit: 'g',
      optional: false,
      alternatives_attributes: [
        { ingredient_name: 'tofu', quantity: null, unit: 'g' },
        { ingredient_name: 'tempeh', quantity: '0,5', unit: 'stuks' },
      ],
    })
  })

  it('bewerken: toont de bestaande alternatieven en stuurt ze met id terug, weggehaalde met _destroy', async () => {
    const wrapper = mount(RecipeForm, { props: { initial: EXISTING } })
    const [kip, rijst] = rows(wrapper)
    const alternatives = kip.findAll('.alternative')
    expect(alternatives.map((a) => a.find('.alt-name').element.value)).toEqual(['tofu', 'tempeh'])
    expect(alternatives[0].find('.alt-quantity').element.value).toBe('')
    expect(alternatives[1].find('.alt-quantity').element.value).toBe('0,5')

    await alternatives[0].find('.alt-remove').trigger('click')
    await rijst.find('.add-alternative').trigger('click')
    await rijst.find('.alt-name').setValue('quinoa')

    const body = await submit(wrapper)
    expect(body.recipe_ingredients_attributes[0].alternatives_attributes).toEqual([
      { id: 4, ingredient_name: 'tempeh', quantity: '0,5', unit: 'stuks' },
      { id: 3, _destroy: true },
    ])
    expect(body.recipe_ingredients_attributes[1].alternatives_attributes).toEqual([
      { ingredient_name: 'quinoa', quantity: null, unit: 'g' },
    ])
  })

  it('bewerken zonder wijziging is niet "dirty", een alternatief erbij wel', async () => {
    const wrapper = mount(RecipeForm, { props: { initial: EXISTING } })
    await rows(wrapper)[1].find('.add-alternative').trigger('click')
    expect(wrapper.emitted('dirty-change')).toBeUndefined()

    await rows(wrapper)[1].find('.alt-name').setValue('quinoa')
    expect(wrapper.emitted('dirty-change')).toEqual([[true]])
  })

  it('een regel zonder alternatieven stuurt geen alternatives_attributes', async () => {
    const wrapper = mount(RecipeForm, { props: { initial: EXISTING } })

    const body = await submit(wrapper)
    expect(body.recipe_ingredients_attributes[1]).not.toHaveProperty('alternatives_attributes')
  })

  it('serverfouten van een alternatief staan bij de regel en maken het veld rood', async () => {
    const wrapper = mount(RecipeForm, { props: { initial: EXISTING } })
    await submit(wrapper)

    await wrapper.setProps({
      errors: {
        'recipe_ingredients[0].alternatives[1].ingredient_name': [
          'is hetzelfde als het ingrediënt zelf',
        ],
        'recipe_ingredients[0].alternatives': ['bevatten het ingrediënt zelf'],
      },
    })

    const kip = rows(wrapper)[0]
    expect(kip.findAll('.error').map((e) => e.text())).toEqual([
      'Alternatief 2: naam is hetzelfde als het ingrediënt zelf',
      'Alternatieven bevatten het ingrediënt zelf',
    ])
    const [tofu, tempeh] = kip.findAll('.alternative')
    expect(tofu.find('.alt-name').attributes('aria-invalid')).toBe('false')
    expect(tempeh.find('.alt-name').attributes('aria-invalid')).toBe('true')
    expect(kip.find('.name').attributes('aria-invalid')).toBe('false')
    expect(wrapper.find('.general-errors').exists()).toBe(false)
  })
})
