import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RecipeForm from '../components/RecipeForm.vue'

function ingredientRows(wrapper) {
  return wrapper.findAll('.ingredient-row')
}

function stepRows(wrapper) {
  return wrapper.findAll('.step-row')
}

function stepTexts(wrapper) {
  return stepRows(wrapper).map((row) => row.find('textarea').element.value)
}

async function fillIngredient(row, { quantity = '', unit = 'g', name = '', note = '' }) {
  await row.find('.quantity').setValue(quantity)
  await row.find('.unit').setValue(unit)
  await row.find('.name').setValue(name)
  await row.find('.note').setValue(note)
}

// Vult de stappen in het formulier; voegt zo nodig rijen toe.
async function fillSteps(wrapper, bodies) {
  for (let i = stepRows(wrapper).length; i < bodies.length; i++) {
    await wrapper.find('.steps .add').trigger('click')
  }
  for (const [i, body] of bodies.entries()) {
    await stepRows(wrapper)[i].find('textarea').setValue(body)
  }
}

async function submit(wrapper) {
  await wrapper.find('form').trigger('submit')
  const events = wrapper.emitted('submit')
  return events[events.length - 1][0]
}

describe('RecipeForm', () => {
  it('begint met één lege ingrediëntregel en één lege stap', () => {
    const wrapper = mount(RecipeForm)

    expect(ingredientRows(wrapper)).toHaveLength(1)
    expect(stepRows(wrapper)).toHaveLength(1)
    expect(wrapper.find('.ingredient-row .unit').element.value).toBe('g')
    // De laatste regel kan niet weg, anders is er niets meer om in te vullen.
    expect(wrapper.find('.ingredient-row .remove').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.step-row .remove').attributes('disabled')).toBeDefined()
  })

  it('biedt alleen g, ml en stuks als eenheid', () => {
    const wrapper = mount(RecipeForm)

    const options = wrapper.findAll('.ingredient-row .unit option').map((o) => o.element.value)
    expect(options).toEqual(['g', 'ml', 'stuks'])
  })

  it('voegt regels toe en nummert de stappen automatisch', async () => {
    const wrapper = mount(RecipeForm)

    await wrapper.find('.ingredients .add').trigger('click')
    await wrapper.find('.steps .add').trigger('click')
    await wrapper.find('.steps .add').trigger('click')

    expect(ingredientRows(wrapper)).toHaveLength(2)
    expect(stepRows(wrapper).map((row) => row.find('label').text())).toEqual([
      'Stap 1',
      'Stap 2',
      'Stap 3',
    ])
  })

  it('verwijdert precies de gekozen regel, en de nummering schuift mee', async () => {
    const wrapper = mount(RecipeForm)
    await fillSteps(wrapper, ['Snijden', 'Bakken', 'Serveren'])

    await stepRows(wrapper)[1].find('.remove').trigger('click')

    expect(stepTexts(wrapper)).toEqual(['Snijden', 'Serveren'])
    expect(stepRows(wrapper)[1].find('label').text()).toBe('Stap 2')
  })

  it('verwijdert een ingrediëntregel met de juiste inhoud', async () => {
    const wrapper = mount(RecipeForm)
    await wrapper.find('.ingredients .add').trigger('click')
    await fillIngredient(ingredientRows(wrapper)[0], { quantity: '200', name: 'bloem' })
    await fillIngredient(ingredientRows(wrapper)[1], { quantity: '2', unit: 'stuks', name: 'ei' })

    await ingredientRows(wrapper)[0].find('.remove').trigger('click')

    expect(ingredientRows(wrapper)).toHaveLength(1)
    expect(ingredientRows(wrapper)[0].find('.name').element.value).toBe('ei')
    expect(ingredientRows(wrapper)[0].find('.unit').element.value).toBe('stuks')
  })

  it('herschikt stappen met omhoog en omlaag', async () => {
    const wrapper = mount(RecipeForm)
    await fillSteps(wrapper, ['A', 'B', 'C'])

    expect(stepRows(wrapper)[0].find('.up').attributes('disabled')).toBeDefined()
    expect(stepRows(wrapper)[2].find('.down').attributes('disabled')).toBeDefined()

    await stepRows(wrapper)[2].find('.up').trigger('click')
    expect(stepTexts(wrapper)).toEqual(['A', 'C', 'B'])

    await stepRows(wrapper)[0].find('.down').trigger('click')
    expect(stepTexts(wrapper)).toEqual(['C', 'A', 'B'])
  })

  it('stuurt ingrediënten en stappen in formuliervolgorde, zonder lege regels', async () => {
    const wrapper = mount(RecipeForm)
    await wrapper.find('#title').setValue('Pannenkoeken')
    await wrapper.find('#description').setValue('Dun en goudbruin.')
    for (let i = 0; i < 3; i++) await wrapper.find('.ingredients .add').trigger('click')
    const rows = ingredientRows(wrapper)
    await fillIngredient(rows[0], { quantity: '250', name: 'bloem' })
    // rows[1] blijft helemaal leeg en gaat niet mee.
    await fillIngredient(rows[2], { quantity: '', name: 'zout' })
    await fillIngredient(rows[3], { quantity: '2', unit: 'stuks', name: 'ei', note: 'losgeklopt' })
    await fillSteps(wrapper, ['Beslag maken.', '   ', 'Bakken.'])
    await stepRows(wrapper)[2].find('.up').trigger('click')

    expect(await submit(wrapper)).toEqual({
      title: 'Pannenkoeken',
      description: 'Dun en goudbruin.',
      servings: 4,
      recipe_ingredients_attributes: [
        { ingredient_name: 'bloem', quantity: 250, unit: 'g', note: '' },
        { ingredient_name: 'zout', quantity: null, unit: 'g', note: '' },
        { ingredient_name: 'ei', quantity: 2, unit: 'stuks', note: 'losgeklopt' },
      ],
      steps_attributes: [{ body: 'Beslag maken.' }, { body: 'Bakken.' }],
    })
  })

  it('stuurt een half ingevulde regel wel mee: de server beoordeelt hem', async () => {
    const wrapper = mount(RecipeForm)
    await fillIngredient(ingredientRows(wrapper)[0], { quantity: '3' })

    const body = await submit(wrapper)

    expect(body.recipe_ingredients_attributes).toEqual([
      { ingredient_name: '', quantity: 3, unit: 'g', note: '' },
    ])
  })

  it('toont serverfouten bij de juiste regel, ook als er lege regels tussen zaten', async () => {
    const wrapper = mount(RecipeForm)
    for (let i = 0; i < 2; i++) await wrapper.find('.ingredients .add').trigger('click')
    await fillIngredient(ingredientRows(wrapper)[0], { quantity: '250', name: 'bloem' })
    await fillIngredient(ingredientRows(wrapper)[2], { quantity: '-1', name: 'suiker' })
    await fillSteps(wrapper, ['', 'Bakken.', 'Leeg?'])
    await submit(wrapper)

    // Index 1 = de tweede verstuurde regel = de derde in het formulier.
    await wrapper.setProps({
      errors: {
        'recipe_ingredients[1].quantity': ['must be greater than 0'],
        'steps[1].body': ['is too long (maximum is 2000 characters)'],
      },
    })

    const ingredients = ingredientRows(wrapper)
    expect(ingredients[0].find('.error').exists()).toBe(false)
    expect(ingredients[1].find('.error').exists()).toBe(false)
    expect(ingredients[2].find('.error').text()).toBe('Hoeveelheid must be greater than 0')

    const steps = stepRows(wrapper)
    expect(steps[1].find('.error').exists()).toBe(false)
    expect(steps[2].find('.error').text()).toBe('Stap is too long (maximum is 2000 characters)')
  })

  it('laat een fout met zijn regel meeverhuizen bij herschikken', async () => {
    const wrapper = mount(RecipeForm)
    await fillSteps(wrapper, ['Goed.', 'Fout.'])
    await submit(wrapper)
    await wrapper.setProps({ errors: { 'steps[1].body': ['is ongeldig'] } })

    await stepRows(wrapper)[1].find('.up').trigger('click')

    expect(stepTexts(wrapper)).toEqual(['Fout.', 'Goed.'])
    expect(stepRows(wrapper)[0].find('.error').text()).toBe('Stap is ongeldig')
    expect(stepRows(wrapper)[1].find('.error').exists()).toBe(false)
  })

  it('toont fouten zonder regel bovenaan het formulier', async () => {
    const wrapper = mount(RecipeForm)
    await submit(wrapper)
    await wrapper.setProps({
      errors: {
        title: ["can't be blank"],
        steps: ["can't be blank"],
        recipe_ingredients: ['has too many rows (maximum is 50)'],
        base: ['has too many rows'],
      },
    })

    const general = wrapper.find('.general-errors')
    expect(general.attributes('role')).toBe('alert')
    expect(general.findAll('li').map((li) => li.text())).toEqual([
      "Stappen can't be blank",
      'Ingrediënten has too many rows (maximum is 50)',
      'has too many rows',
    ])
    // De titel heeft al een eigen plek bij het veld.
    expect(general.text()).not.toContain('Titel')
  })

  it('zonder rows: geen ingrediënten of stappen, alleen de basisvelden', async () => {
    const wrapper = mount(RecipeForm, {
      props: { rows: false, initial: { title: 'Soep', description: '', servings: 2 } },
    })

    expect(wrapper.find('fieldset').exists()).toBe(false)
    expect(await submit(wrapper)).toEqual({ title: 'Soep', description: '', servings: 2 })
  })
})
