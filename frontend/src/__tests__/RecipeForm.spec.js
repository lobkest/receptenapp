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

async function fillIngredient(row, { quantity = '', unit = 'g', name = '', optional = false }) {
  await row.find('.quantity').setValue(quantity)
  await row.find('.unit').setValue(unit)
  await row.find('.name').setValue(name)
  await row.find('.optional input').setValue(optional)
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

  it('gebruikt tekstvelden met een cijfertoetsenbord voor porties en hoeveelheid', () => {
    const wrapper = mount(RecipeForm)

    const servings = wrapper.find('#servings')
    expect(servings.attributes()).toMatchObject({
      type: 'text',
      inputmode: 'numeric',
      pattern: '[0-9]*',
    })
    const quantity = wrapper.find('.ingredient-row .quantity')
    expect(quantity.attributes()).toMatchObject({ type: 'text', inputmode: 'decimal' })
    expect(wrapper.find('#description').attributes('rows')).toBe('3')
    expect(wrapper.find('.step-row textarea').attributes('rows')).toBe('2')
  })

  it('heeft een verwijderknop met een duidelijke naam voor schermlezers', async () => {
    const wrapper = mount(RecipeForm)
    await wrapper.find('.ingredients .add').trigger('click')

    const remove = ingredientRows(wrapper)[1].find('.remove')
    expect(remove.text()).toBe('×')
    expect(remove.attributes('aria-label')).toBe('Ingrediënt 2 verwijderen')
  })

  it('stuurt optional mee, standaard false', async () => {
    const wrapper = mount(RecipeForm)
    await wrapper.find('.ingredients .add').trigger('click')
    await fillIngredient(ingredientRows(wrapper)[0], { quantity: '200', name: 'bloem' })
    await fillIngredient(ingredientRows(wrapper)[1], { name: 'peterselie', optional: true })

    expect((await submit(wrapper)).recipe_ingredients_attributes).toEqual([
      { ingredient_name: 'bloem', quantity: '200', unit: 'g', optional: false },
      { ingredient_name: 'peterselie', quantity: null, unit: 'g', optional: true },
    ])
  })

  it('stuurt ongeldige getallen zoals getypt, zodat de server een fout kan melden', async () => {
    const wrapper = mount(RecipeForm)
    await wrapper.find('#servings').setValue('2,5')
    await fillIngredient(ingredientRows(wrapper)[0], { quantity: '1,2,3', name: 'ui' })

    const body = await submit(wrapper)
    expect(body.servings).toBe('2,5')
    expect(body.recipe_ingredients_attributes[0].quantity).toBe('1,2,3')
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
    await fillIngredient(rows[2], { quantity: '  ', name: 'zout', optional: true })
    await fillIngredient(rows[3], { quantity: ' 1,5 ', unit: 'stuks', name: 'ei' })
    await fillSteps(wrapper, ['Beslag maken.', '   ', 'Bakken.'])
    await stepRows(wrapper)[2].find('.up').trigger('click')

    expect(await submit(wrapper)).toEqual({
      title: 'Pannenkoeken',
      description: 'Dun en goudbruin.',
      servings: '4',
      recipe_ingredients_attributes: [
        { ingredient_name: 'bloem', quantity: '250', unit: 'g', optional: false },
        // Leeg (ook alleen spaties) is "naar smaak": null.
        { ingredient_name: 'zout', quantity: null, unit: 'g', optional: true },
        // Precies zoals getypt, met komma: de server zet die om.
        { ingredient_name: 'ei', quantity: '1,5', unit: 'stuks', optional: false },
      ],
      steps_attributes: [{ body: 'Beslag maken.' }, { body: 'Bakken.' }],
    })
  })

  it('stuurt een half ingevulde regel wel mee: de server beoordeelt hem', async () => {
    const wrapper = mount(RecipeForm)
    await fillIngredient(ingredientRows(wrapper)[0], { quantity: '3' })

    const body = await submit(wrapper)

    expect(body.recipe_ingredients_attributes).toEqual([
      { ingredient_name: '', quantity: '3', unit: 'g', optional: false },
    ])
  })

  it('toont serverfouten bij de juiste regel, ook als er lege regels tussen zaten', async () => {
    const wrapper = mount(RecipeForm)
    for (let i = 0; i < 2; i++) await wrapper.find('.ingredients .add').trigger('click')
    await fillIngredient(ingredientRows(wrapper)[0], { quantity: '250', name: 'bloem' })
    await fillIngredient(ingredientRows(wrapper)[2], { quantity: 'abc', name: 'suiker' })
    await fillSteps(wrapper, ['', 'Bakken.', 'Leeg?'])
    await submit(wrapper)

    // Index 1 = de tweede verstuurde regel = de derde in het formulier.
    await wrapper.setProps({
      errors: {
        'recipe_ingredients[1].quantity': ['is not a number'],
        'steps[1].body': ['is too long (maximum is 2000 characters)'],
      },
    })

    const ingredients = ingredientRows(wrapper)
    expect(ingredients[0].find('.error').exists()).toBe(false)
    expect(ingredients[1].find('.error').exists()).toBe(false)
    expect(ingredients[2].find('.error').text()).toBe('Hoeveelheid is not a number')
    // Het foute veld krijgt een rode rand, de andere velden van die regel niet.
    expect(ingredients[2].find('.quantity').attributes('aria-invalid')).toBe('true')
    expect(ingredients[2].find('.name').attributes('aria-invalid')).toBe('false')

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
})

// Een bestaand recept zoals de admin-API het teruggeeft (GET /api/admin/recipes/:id).
const PANCAKES = {
  id: 1,
  title: 'Pannenkoeken',
  description: 'Dun.',
  servings: 4,
  status: 'approved',
  ingredients: [
    { id: 21, name: 'bloem', quantity: 250, unit: 'g', optional: false },
    { id: 22, name: 'zout', quantity: null, unit: null, optional: true },
    { id: 23, name: 'olie', quantity: 0.5, unit: 'ml', optional: false },
  ],
  steps: [
    { id: 11, position: 1, body: 'Beslag maken.' },
    { id: 12, position: 2, body: 'Laten rusten.' },
    { id: 13, position: 3, body: 'Bakken.' },
  ],
}

function mountEdit() {
  return mount(RecipeForm, { props: { initial: PANCAKES, submitLabel: 'Opslaan' } })
}

function lastDirty(wrapper) {
  return wrapper.emitted('dirty-change')?.at(-1)[0]
}

describe('RecipeForm bij bewerken', () => {
  it('vult de bestaande regels uit initial; "naar smaak" wordt een leeg veld', () => {
    const wrapper = mountEdit()

    expect(stepTexts(wrapper)).toEqual(['Beslag maken.', 'Laten rusten.', 'Bakken.'])
    const rows = ingredientRows(wrapper)
    expect(rows.map((row) => row.find('.name').element.value)).toEqual(['bloem', 'zout', 'olie'])
    expect(rows[0].find('.quantity').element.value).toBe('250')
    expect(rows[1].find('.quantity').element.value).toBe('')
    // Een decimaal getal van de API verschijnt met een komma.
    expect(rows[2].find('.quantity').element.value).toBe('0,5')
    expect(rows.map((row) => row.find('.optional input').element.checked)).toEqual([
      false,
      true,
      false,
    ])
    expect(wrapper.find('button[type="submit"]').text()).toBe('Opslaan')
  })

  it('stuurt zonder wijzigingen alle bestaande regels met hun id', async () => {
    const body = await submit(mountEdit())

    expect(body.recipe_ingredients_attributes).toEqual([
      { id: 21, ingredient_name: 'bloem', quantity: '250', unit: 'g', optional: false },
      { id: 22, ingredient_name: 'zout', quantity: null, unit: 'g', optional: true },
      { id: 23, ingredient_name: 'olie', quantity: '0,5', unit: 'ml', optional: false },
    ])
    expect(body.steps_attributes).toEqual([
      { id: 11, body: 'Beslag maken.' },
      { id: 12, body: 'Laten rusten.' },
      { id: 13, body: 'Bakken.' },
    ])
  })

  it('stuurt gewijzigde en herschikte regels met id, nieuwe zonder, en verwijderde als _destroy achteraan', async () => {
    const wrapper = mountEdit()

    // Stappen: "Laten rusten." weg, "Bakken." omhoog, een nieuwe stap erbij.
    await stepRows(wrapper)[1].find('.remove').trigger('click')
    await stepRows(wrapper)[1].find('.up').trigger('click')
    await stepRows(wrapper)[1].find('textarea').setValue('Beslag maken met melk.')
    await fillSteps(wrapper, ['Bakken.', 'Beslag maken met melk.', 'Opdienen.'])
    // Ingrediënten: bloem wijzigen, zout en olie weg, suiker erbij.
    await ingredientRows(wrapper)[0].find('.quantity').setValue('300')
    await ingredientRows(wrapper)[2].find('.remove').trigger('click')
    await ingredientRows(wrapper)[1].find('.remove').trigger('click')
    await wrapper.find('.ingredients .add').trigger('click')
    await fillIngredient(ingredientRows(wrapper)[1], { quantity: '25', name: 'suiker' })

    expect(await submit(wrapper)).toEqual({
      title: 'Pannenkoeken',
      description: 'Dun.',
      servings: '4',
      recipe_ingredients_attributes: [
        { id: 21, ingredient_name: 'bloem', quantity: '300', unit: 'g', optional: false },
        { ingredient_name: 'suiker', quantity: '25', unit: 'g', optional: false },
        { id: 23, _destroy: true },
        { id: 22, _destroy: true },
      ],
      steps_attributes: [
        { id: 13, body: 'Bakken.' },
        { id: 11, body: 'Beslag maken met melk.' },
        { body: 'Opdienen.' },
        { id: 12, _destroy: true },
      ],
    })
  })

  it('verwijdert een nieuwe regel gewoon, zonder _destroy', async () => {
    const wrapper = mountEdit()
    await fillSteps(wrapper, ['Beslag maken.', 'Laten rusten.', 'Bakken.', 'Extra'])

    await stepRows(wrapper)[3].find('.remove').trigger('click')

    expect((await submit(wrapper)).steps_attributes).toEqual([
      { id: 11, body: 'Beslag maken.' },
      { id: 12, body: 'Laten rusten.' },
      { id: 13, body: 'Bakken.' },
    ])
  })

  it('stuurt een leeggemaakte bestaande regel wel mee: weghalen gaat alleen met de knop', async () => {
    const wrapper = mountEdit()
    await stepRows(wrapper)[0].find('textarea').setValue('')

    expect((await submit(wrapper)).steps_attributes[0]).toEqual({ id: 11, body: '' })
  })

  it('toont fouten bij de juiste regel als er verwijderde regels meegaan', async () => {
    const wrapper = mountEdit()
    await stepRows(wrapper)[0].find('.remove').trigger('click')
    await submit(wrapper)

    // Request: [12, 13, 11 (_destroy)]. Index 1 is dus "Bakken.", nu de tweede regel.
    await wrapper.setProps({ errors: { 'steps[1].body': ['is ongeldig'] } })

    expect(stepRows(wrapper)[0].find('.error').exists()).toBe(false)
    expect(stepRows(wrapper)[1].find('.error').text()).toBe('Stap is ongeldig')
  })

  it('laat een ouder recept zonder regels de lijsten weglaten, zodat bewerken kan', async () => {
    const wrapper = mount(RecipeForm, {
      props: {
        initial: { title: 'Soep', description: '', servings: 2, ingredients: [], steps: [] },
      },
    })

    expect(stepRows(wrapper)).toHaveLength(1)
    expect(await submit(wrapper)).toEqual({ title: 'Soep', description: '', servings: '2' })
  })
})

describe('RecipeForm: niet-opgeslagen wijzigingen (dirty-change)', () => {
  it('meldt een gewijzigde stap, en niets meer als je hem terugzet', async () => {
    const wrapper = mountEdit()
    expect(wrapper.emitted('dirty-change')).toBeUndefined()

    await stepRows(wrapper)[0].find('textarea').setValue('Iets anders.')
    expect(lastDirty(wrapper)).toBe(true)

    await stepRows(wrapper)[0].find('textarea').setValue('Beslag maken.')
    expect(lastDirty(wrapper)).toBe(false)
  })

  it('meldt een gewijzigd ingrediënt, ook als alleen "optioneel" verandert', async () => {
    const wrapper = mountEdit()
    await ingredientRows(wrapper)[0].find('.optional input').setValue(true)
    expect(lastDirty(wrapper)).toBe(true)

    await ingredientRows(wrapper)[0].find('.optional input').setValue(false)
    expect(lastDirty(wrapper)).toBe(false)
  })

  it('telt een ongewijzigd decimaal getal niet als wijziging', async () => {
    const wrapper = mountEdit()
    await ingredientRows(wrapper)[2].find('.quantity').setValue('0,5')

    expect(wrapper.emitted('dirty-change')).toBeUndefined()
  })

  it('meldt herschikken, en terugschuiven maakt het weer ongewijzigd', async () => {
    const wrapper = mountEdit()

    await stepRows(wrapper)[2].find('.up').trigger('click')
    expect(lastDirty(wrapper)).toBe(true)

    await stepRows(wrapper)[1].find('.down').trigger('click')
    expect(lastDirty(wrapper)).toBe(false)
  })

  it('meldt het verwijderen van een bestaande regel', async () => {
    const wrapper = mountEdit()
    await ingredientRows(wrapper)[0].find('.remove').trigger('click')

    expect(lastDirty(wrapper)).toBe(true)
  })

  it('telt een lege nieuwe regel niet als wijziging, een ingevulde wel', async () => {
    const wrapper = mountEdit()

    await wrapper.find('.steps .add').trigger('click')
    expect(wrapper.emitted('dirty-change')).toBeUndefined()

    await stepRows(wrapper)[3].find('textarea').setValue('Opdienen.')
    expect(lastDirty(wrapper)).toBe(true)
  })
})
