import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TagPicker from '../components/TagPicker.vue'

const OPTIONS = ['glutenvrij', 'snel', 'vega']

// Werkt als v-model: elke update:modelValue komt meteen terug als prop, zoals in de ouder.
function mountPicker(props = {}) {
  const wrapper = mount(TagPicker, {
    props: {
      options: OPTIONS,
      modelValue: [],
      'onUpdate:modelValue': (value) => wrapper.setProps({ modelValue: value }),
      ...props,
    },
    attachTo: document.body,
  })
  return wrapper
}

function chips(wrapper) {
  return wrapper.findAll('.chip-name').map((chip) => chip.text())
}

function optionTexts(wrapper) {
  return wrapper.findAll('.tag-select option').map((o) => o.text())
}

async function addNew(wrapper, name, how = 'click') {
  await wrapper.find('.tag-select').setValue('NEW')
  await wrapper.find('.new-tag-input').setValue(name)
  if (how === 'enter') {
    await wrapper.find('.new-tag-input').trigger('keydown', { key: 'Enter' })
  } else {
    await wrapper.find('.new-tag-add').trigger('click')
  }
}

describe('TagPicker', () => {
  it('biedt de bestaande tags plus "Nieuwe tag…", en nog geen chips', () => {
    const wrapper = mountPicker()

    expect(optionTexts(wrapper)).toEqual([
      'Kies een tag…',
      'glutenvrij',
      'snel',
      'vega',
      'Nieuwe tag…',
    ])
    expect(chips(wrapper)).toEqual([])
    wrapper.unmount()
  })

  it('voegt een tag uit de lijst toe; die verdwijnt dan uit de lijst', async () => {
    const wrapper = mountPicker()

    await wrapper.find('.tag-select').setValue('vega')

    expect(chips(wrapper)).toEqual(['vega'])
    expect(optionTexts(wrapper)).not.toContain('vega')
    expect(wrapper.find('.tag-select').element.value).toBe('')
    wrapper.unmount()
  })

  it('toont bij "Nieuwe tag…" een tekstveld met focus en een Toevoegen-knop', async () => {
    const wrapper = mountPicker()
    expect(wrapper.find('.new-tag-input').exists()).toBe(false)

    await wrapper.find('.tag-select').setValue('NEW')

    const input = wrapper.find('.new-tag-input')
    expect(document.activeElement).toBe(input.element)
    expect(input.attributes('maxlength')).toBe('30')
    expect(wrapper.find('.new-tag-add').text()).toBe('Toevoegen')
    wrapper.unmount()
  })

  it('voegt een nieuwe tag genormaliseerd toe, met de knop of met Enter', async () => {
    const wrapper = mountPicker()

    await addNew(wrapper, '  Zonder   Oven ')
    await addNew(wrapper, 'Kerst', 'enter')

    expect(chips(wrapper)).toEqual(['zonder oven', 'kerst'])
    expect(wrapper.find('.new-tag-input').exists()).toBe(false)
    wrapper.unmount()
  })

  it('voegt geen dubbele toe, ook niet met andere hoofdletters', async () => {
    const wrapper = mountPicker({ modelValue: ['vega'] })

    await addNew(wrapper, ' VEGA')

    expect(chips(wrapper)).toEqual(['vega'])
    expect(wrapper.find('.error').text()).toBe('"vega" is al gekozen.')
    wrapper.unmount()
  })

  it('weigert een lege tag en een tag met een komma', async () => {
    const wrapper = mountPicker()

    await addNew(wrapper, '   ')
    expect(chips(wrapper)).toEqual([])

    await addNew(wrapper, 'vega,snel')
    expect(chips(wrapper)).toEqual([])
    expect(wrapper.find('.error').text()).toBe('Een tag mag geen komma bevatten.')
    wrapper.unmount()
  })

  it('verwijdert een tag met de ×-knop, die een duidelijke naam heeft', async () => {
    const wrapper = mountPicker({ modelValue: ['vega', 'snel'] })

    const remove = wrapper.find('button[aria-label="vega verwijderen"]')
    expect(remove.text()).toBe('×')
    await remove.trigger('click')

    expect(chips(wrapper)).toEqual(['snel'])
    expect(optionTexts(wrapper)).toContain('vega')
    wrapper.unmount()
  })

  it('stopt bij het maximum', async () => {
    const wrapper = mountPicker({ modelValue: ['a', 'b'], max: 2 })

    expect(wrapper.find('.tag-select').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.hint').text()).toBe('Maximaal 2 tags.')
    wrapper.unmount()
  })
})
