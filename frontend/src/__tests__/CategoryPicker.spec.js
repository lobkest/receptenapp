import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CategoryPicker from '../components/CategoryPicker.vue'

const CATEGORIES = [
  { id: 3, name: 'Diner', position: 3 },
  { id: 1, name: 'Ontbijt', position: 1 },
  { id: 6, name: 'Zondag', position: 6 },
  { id: 2, name: 'Lunch', position: 2 },
  { id: 4, name: 'Snacks', position: 4 },
  { id: 5, name: 'Bijgerecht', position: 5 },
]

// Zoals v-model in een ouder: elke update komt terug als modelValue.
function mountPicker(props = {}) {
  const wrapper = mount(CategoryPicker, {
    props: {
      modelValue: '',
      options: CATEGORIES,
      'onUpdate:modelValue': (value) => wrapper.setProps({ modelValue: value }),
      ...props,
    },
  })
  return wrapper
}

function buttons(wrapper) {
  return wrapper.findAll('.buttons button').map((b) => [b.text(), b.attributes('aria-pressed')])
}

function button(wrapper, name) {
  return wrapper.findAll('.buttons button').find((b) => b.text() === name)
}

function value(wrapper) {
  return wrapper.props('modelValue')
}

describe('CategoryPicker', () => {
  it('toont de vier eerste categorieën op volgorde als knoppen, en "+"', () => {
    const wrapper = mountPicker()

    expect(buttons(wrapper)).toEqual([
      ['Ontbijt', 'false'],
      ['Lunch', 'false'],
      ['Diner', 'false'],
      ['Snacks', 'false'],
      ['+', 'false'],
    ])
    expect(wrapper.find('.buttons').attributes('role')).toBe('group')
    expect(wrapper.find('select').exists()).toBe(false)
  })

  it('kiest een knop, nog eens tikken zet hem uit, en er is er altijd hoogstens één', async () => {
    const wrapper = mountPicker()

    await button(wrapper, 'Lunch').trigger('click')
    expect(value(wrapper)).toBe('Lunch')
    expect(button(wrapper, 'Lunch').attributes('aria-pressed')).toBe('true')

    await button(wrapper, 'Diner').trigger('click')
    expect(value(wrapper)).toBe('Diner')
    expect(buttons(wrapper).filter(([, pressed]) => pressed === 'true')).toEqual([
      ['Diner', 'true'],
    ])

    await button(wrapper, 'Diner').trigger('click')
    expect(value(wrapper)).toBe('')
    expect(buttons(wrapper).every(([, pressed]) => pressed === 'false')).toBe(true)
  })

  it('"+" toont alleen de overige categorieën en "Nieuwe categorie…"', async () => {
    const wrapper = mountPicker()

    await button(wrapper, '+').trigger('click')

    expect(button(wrapper, '+').attributes('aria-expanded')).toBe('true')
    expect(wrapper.findAll('select option').map((o) => o.text())).toEqual([
      'Kies een categorie…',
      'Bijgerecht',
      'Zondag',
      'Nieuwe categorie…',
    ])
  })

  it('een overige categorie kiezen sluit de lijst; "+" staat dan ingedrukt met de naam', async () => {
    const wrapper = mountPicker()

    await button(wrapper, '+').trigger('click')
    await wrapper.find('select').setValue('5')

    expect(value(wrapper)).toBe('Bijgerecht')
    expect(wrapper.find('select').exists()).toBe(false)
    expect(buttons(wrapper).at(-1)).toEqual(['Bijgerecht', 'true'])
    expect(button(wrapper, 'Ontbijt').attributes('aria-pressed')).toBe('false')
  })

  it('"Nieuwe categorie…" toont een tekstveld; de getypte naam is de keuze', async () => {
    const wrapper = mountPicker({ modelValue: 'Lunch' })

    await button(wrapper, '+').trigger('click')
    await wrapper.find('select').setValue('new')
    await wrapper.find('input').setValue('  Feest ')

    expect(value(wrapper)).toBe('Feest')
    expect(buttons(wrapper).at(-1)).toEqual(['Feest', 'true'])
    expect(button(wrapper, 'Lunch').attributes('aria-pressed')).toBe('false')
  })

  it('daarna toch een standaardknop: de lijst en het tekstveld verdwijnen', async () => {
    const wrapper = mountPicker()

    await button(wrapper, '+').trigger('click')
    await wrapper.find('select').setValue('new')
    await wrapper.find('input').setValue('Feest')
    await button(wrapper, 'Snacks').trigger('click')

    expect(value(wrapper)).toBe('Snacks')
    expect(wrapper.find('.more').exists()).toBe(false)
    expect(buttons(wrapper).at(-1)).toEqual(['+', 'false'])
  })

  it('bij bewerken met een overige categorie staat "+" ingedrukt met de naam; tikken opent de lijst met die gekozen', async () => {
    const wrapper = mountPicker({ modelValue: 'Zondag' })

    expect(buttons(wrapper).at(-1)).toEqual(['Zondag', 'true'])
    await button(wrapper, 'Zondag').trigger('click')
    expect(wrapper.find('select').element.value).toBe('6')
  })

  it('herkent een standaardcategorie ongeacht hoofdletters', () => {
    const wrapper = mountPicker({ modelValue: 'ontbijt' })

    expect(button(wrapper, 'Ontbijt').attributes('aria-pressed')).toBe('true')
    expect(buttons(wrapper).at(-1)).toEqual(['+', 'false'])
  })

  it('zonder overige categorieën (of zonder geladen categorieën) opent "+" meteen het tekstveld', async () => {
    const wrapper = mountPicker({ options: [] })
    expect(buttons(wrapper)).toEqual([['+', 'false']])

    await button(wrapper, '+').trigger('click')

    expect(wrapper.find('select').exists()).toBe(false)
    expect(wrapper.find('input').exists()).toBe(true)
  })

  it('validate meldt een lege nieuwe categorie; zonder open tekstveld is alles goed', async () => {
    const wrapper = mountPicker()
    expect(wrapper.vm.validate()).toBe(true)

    await button(wrapper, '+').trigger('click')
    await wrapper.find('select').setValue('new')
    expect(wrapper.vm.validate()).toBe(false)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.error').text()).toBe('Vul een naam voor de nieuwe categorie in.')
    expect(wrapper.find('input').attributes('aria-invalid')).toBe('true')
  })

  it('toont een fout van de server', () => {
    const wrapper = mountPicker({ error: 'Categorie is te lang (maximaal 30 tekens)' })

    expect(wrapper.find('.error').text()).toBe('Categorie is te lang (maximaal 30 tekens)')
  })
})
