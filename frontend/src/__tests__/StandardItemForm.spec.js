import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StandardItemForm from '../components/StandardItemForm.vue'

const CATEGORIES = ['bakker', 'groente & fruit', 'zuivel']

function mountForm(props = {}) {
  return mount(StandardItemForm, { props: { categories: CATEGORIES, ...props } })
}

function optionTexts(wrapper) {
  return wrapper.findAll('select.category option').map((o) => o.text())
}

async function submit(wrapper) {
  await wrapper.find('form').trigger('submit')
  return wrapper.emitted('save')?.at(-1)[0]
}

describe('StandardItemForm', () => {
  it('heeft alleen Naam en Categorie, geen hoeveelheid of eenheid', () => {
    const wrapper = mountForm()

    expect(wrapper.findAll('label').map((l) => l.text())).toEqual(['Naam', 'Categorie'])
    expect(wrapper.find('.quantity').exists()).toBe(false)
    expect(wrapper.find('.unit').exists()).toBe(false)
  })

  it('biedt de bestaande categorieën, plus "Geen categorie" en "Nieuwe categorie…"', () => {
    expect(optionTexts(mountForm())).toEqual([
      'Geen categorie',
      'bakker',
      'groente & fruit',
      'zuivel',
      'Nieuwe categorie…',
    ])
  })

  it('stuurt naam en gekozen categorie', async () => {
    const wrapper = mountForm()
    await wrapper.find('.name').setValue('Brood')
    await wrapper.find('select.category').setValue('bakker')

    expect(await submit(wrapper)).toEqual({ name: 'Brood', category: 'bakker' })
  })

  it('stuurt null zonder categorie', async () => {
    const wrapper = mountForm()
    await wrapper.find('.name').setValue('wc-papier')

    expect(await submit(wrapper)).toEqual({ name: 'wc-papier', category: null })
  })

  it('toont bij "Nieuwe categorie…" een tekstveld met focus, en stuurt wat je typt', async () => {
    const wrapper = mount(StandardItemForm, {
      props: { categories: CATEGORIES },
      attachTo: document.body,
    })
    expect(wrapper.find('.new-category').exists()).toBe(false)

    await wrapper.find('select.category').setValue('NEW')

    const input = wrapper.find('.new-category')
    expect(input.exists()).toBe(true)
    expect(document.activeElement).toBe(input.element)
    expect(wrapper.find(`label[for="${input.attributes('id')}"]`).text()).toBe('Nieuwe categorie')

    await wrapper.find('.name').setValue('chocola')
    await input.setValue('  Snoep ')
    expect(await submit(wrapper)).toEqual({ name: 'chocola', category: 'Snoep' })
    wrapper.unmount()
  })

  it('verbergt het tekstveld weer als je een bestaande categorie kiest', async () => {
    const wrapper = mountForm()
    await wrapper.find('select.category').setValue('NEW')
    await wrapper.find('select.category').setValue('zuivel')

    expect(wrapper.find('.new-category').exists()).toBe(false)
  })

  it('meldt een ontbrekende naam en een lege nieuwe categorie, zonder te versturen', async () => {
    const wrapper = mountForm()
    await wrapper.find('select.category').setValue('NEW')

    expect(await submit(wrapper)).toBeUndefined()
    expect(wrapper.findAll('.error').map((e) => e.text())).toEqual([
      'Vul een naam in.',
      'Vul een naam voor de nieuwe categorie in.',
    ])
    expect(wrapper.find('.name').attributes('aria-invalid')).toBe('true')
  })

  it('toont fouten van de server bij het veld', () => {
    const wrapper = mountForm({ errors: { name: ['is al in gebruik'] } })

    expect(wrapper.find('.error').text()).toBe('Naam is al in gebruik')
  })

  it('begint bij bewerken met de naam en categorie van het item', async () => {
    const wrapper = mountForm({
      initial: { id: 1, name: 'melk', category: 'zuivel' },
      submitLabel: 'Opslaan',
      cancellable: true,
    })

    expect(wrapper.find('.name').element.value).toBe('melk')
    expect(wrapper.find('select.category').element.value).toBe('zuivel')
    expect(wrapper.find('.save').text()).toBe('Opslaan')

    await wrapper.find('.cancel').trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })
})
