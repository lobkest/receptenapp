import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import VariationForm from '../components/VariationForm.vue'

const BASE = [
  { id: 21, name: 'tofu', quantity: 200, unit: 'g' },
  { id: 22, name: 'rijst', quantity: 150, unit: 'g' },
  { id: 23, name: 'zout', quantity: null, unit: null },
]

// Een bestaande variatie zoals de API hem stuurt.
const WITH_CHICKEN = {
  id: 7,
  name: 'Met kip',
  notes: 'Kip eerst bakken.',
  lock_version: 3,
  changes: [
    { id: 1, kind: 'remove', recipe_ingredient_id: 21, name: 'tofu', quantity: null, unit: null },
    { id: 2, kind: 'add', recipe_ingredient_id: null, name: 'kip', quantity: 1.5, unit: 'stuks' },
  ],
  tag_changes: [
    { kind: 'add', tag: 'vlees' },
    { kind: 'remove', tag: 'vega' },
  ],
}

function mountForm(props = {}) {
  return mount(VariationForm, {
    props: {
      baseIngredients: BASE,
      baseTags: ['vega', 'snel'],
      availableTags: ['snel', 'vega', 'vis'],
      ...props,
    },
  })
}

function checkboxFor(wrapper, legend, label) {
  const group = wrapper.findAll('fieldset').find((f) => f.find('legend').text() === legend)
  return group
    .findAll('label.check')
    .find((l) => l.text().startsWith(label))
    .find('input')
}

async function submit(wrapper) {
  await wrapper.find('form').trigger('submit')
  const events = wrapper.emitted('submit')
  return events[events.length - 1][0]
}

describe('VariationForm', () => {
  it('stuurt naam, notities, weggelaten regels, extra ingrediënten en tags', async () => {
    const wrapper = mountForm()

    await wrapper.find('input[type="text"]').setValue('Met kip')
    await wrapper.find('textarea').setValue('Kip eerst bakken.')
    await checkboxFor(wrapper, '− ingrediënt', 'tofu').setValue(true)
    await wrapper.find('[aria-label="Naam extra ingrediënt 1"]').setValue('kip')
    await wrapper.find('[aria-label="Hoeveelheid extra ingrediënt 1"]').setValue('1,5')
    await wrapper.find('[aria-label="Eenheid extra ingrediënt 1"]').setValue('stuks')
    // Een lege tweede regel gaat niet mee.
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '+ ingrediënt')
      .trigger('click')
    await wrapper.find('.tag-select').setValue('vis')
    await wrapper.find('.tag-select').trigger('change')
    await checkboxFor(wrapper, 'Tag eraf', 'vega').setValue(true)

    expect(await submit(wrapper)).toEqual({
      name: 'Met kip',
      notes: 'Kip eerst bakken.',
      removed_ingredient_ids: [21],
      added_ingredients: [{ name: 'kip', quantity: '1,5', unit: 'stuks' }],
      added_tag_names: ['vis'],
      removed_tag_names: ['vega'],
    })
  })

  it('heeft notities van twee regels, en zonder hoeveelheid alleen de naam in de lijst om weg te laten', () => {
    const wrapper = mountForm()

    expect(wrapper.find('textarea').attributes('rows')).toBe('2')
    const labels = wrapper.findAll('label.check').map((l) => l.text())
    expect(labels).toContain('tofu 200 g')
    expect(labels).toContain('zout')
  })

  it('begint een nieuwe extra regel op stuks, met g, ml, stuks, tl en el als keuze', () => {
    const wrapper = mountForm()

    const unit = wrapper.find('[aria-label="Eenheid extra ingrediënt 1"]')
    expect(unit.element.value).toBe('stuks')
    expect(unit.findAll('option').map((o) => o.text())).toEqual(['g', 'ml', 'stuks', 'tl', 'el'])
  })

  it('toont bij weglaten geen "naar smaak" en geen losse eenheid', () => {
    const labels = mountForm()
      .findAll('label.check')
      .map((l) => l.text())

    expect(labels).toContain('zout')
    expect(labels.join(' ')).not.toContain('naar smaak')
  })

  it('biedt bij "Tag erbij" alleen tags die het recept nog niet heeft', () => {
    const wrapper = mountForm()

    const options = wrapper.findAll('.tag-select option').map((o) => o.text())
    expect(options).toEqual(['Kies een tag…', 'vis', 'Nieuwe tag…'])
  })

  it('vult een bestaande variatie in, en stuurt die ongewijzigd terug', async () => {
    const wrapper = mountForm({ initial: WITH_CHICKEN })

    expect(wrapper.find('input[type="text"]').element.value).toBe('Met kip')
    expect(checkboxFor(wrapper, '− ingrediënt', 'tofu').element.checked).toBe(true)
    expect(wrapper.find('[aria-label="Hoeveelheid extra ingrediënt 1"]').element.value).toBe('1,5')
    expect(await submit(wrapper)).toEqual({
      name: 'Met kip',
      notes: 'Kip eerst bakken.',
      removed_ingredient_ids: [21],
      added_ingredients: [{ name: 'kip', quantity: '1,5', unit: 'stuks' }],
      added_tag_names: ['vlees'],
      removed_tag_names: ['vega'],
    })
  })

  it('legt uit dat weglaten pas kan na opslaan, als het recept nog geen opgeslagen regels heeft', () => {
    const wrapper = mountForm({
      baseIngredients: [{ id: null, name: 'tofu', quantity: 200, unit: 'g' }],
    })

    expect(wrapper.text()).toContain('Ingrediënten weglaten kan pas als het recept is opgeslagen.')
    expect(wrapper.findAll('label.check input[type="checkbox"]')).toHaveLength(2) // alleen de tags
  })

  it('toont serverfouten bij het veld en bij de juiste extra regel', async () => {
    const wrapper = mountForm()
    await wrapper.find('[aria-label="Naam extra ingrediënt 1"]').setValue('kip')
    await wrapper.find('[aria-label="Hoeveelheid extra ingrediënt 1"]').setValue('abc')
    await submit(wrapper)

    await wrapper.setProps({
      errors: {
        name: ['moet opgegeven zijn'],
        'additions[0].quantity': ['is geen getal'],
        base: ['Dit recept heeft al 10 variaties, het maximum'],
      },
    })

    expect(wrapper.find('.field .error').text()).toBe('Naam moet opgegeven zijn')
    expect(wrapper.find('.addition-row .error').text()).toBe('Hoeveelheid is geen getal')
    expect(
      wrapper.find('[aria-label="Hoeveelheid extra ingrediënt 1"]').attributes('aria-invalid'),
    ).toBe('true')
    expect(wrapper.find('[role="alert"]').text()).toBe(
      'Dit recept heeft al 10 variaties, het maximum',
    )
  })

  it('heeft ingebed geen eigen formulier en knoppen; de ouder haalt de body op', async () => {
    const wrapper = mountForm({ embedded: true })
    await wrapper.find('input[type="text"]').setValue('Zonder rijst')
    await checkboxFor(wrapper, '− ingrediënt', 'rijst').setValue(true)

    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.find('button[type="submit"]').exists()).toBe(false)
    expect(wrapper.vm.submitted()).toMatchObject({
      name: 'Zonder rijst',
      removed_ingredient_ids: [22],
      added_ingredients: [],
    })
  })

  it('Annuleren meldt zich bij de ouder', async () => {
    const wrapper = mountForm()

    await wrapper.find('button.cancel').trigger('click')

    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })
})
