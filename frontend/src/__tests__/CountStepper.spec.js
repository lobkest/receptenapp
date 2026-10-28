import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CountStepper from '../components/CountStepper.vue'

function mountStepper(props = {}) {
  return mount(CountStepper, {
    props: { count: 2, name: 'melk', ...props },
    attachTo: document.body,
  })
}

const down = (wrapper) => wrapper.find('.step.down')
const up = (wrapper) => wrapper.find('.step.up')
const value = (wrapper) => wrapper.find('.value')
const changes = (wrapper) => (wrapper.emitted('change') ?? []).map(([count]) => count)

// Tikken in het getal (focus) en iets typen.
async function typeCount(wrapper, text) {
  const input = value(wrapper)
  input.element.focus()
  await input.setValue(text)
  return input
}

describe('CountStepper', () => {
  it('toont het getal altijd, ook bij 1, met duidelijke labels', () => {
    const wrapper = mountStepper({ count: 1 })

    expect(value(wrapper).element.value).toBe('1')
    expect(wrapper.find('[role="group"]').attributes('aria-label')).toBe('Aantal melk')
    expect(down(wrapper).attributes('aria-label')).toBe('Eén melk minder')
    expect(up(wrapper).attributes('aria-label')).toBe('Eén melk meer')
    wrapper.unmount()
  })

  it('− en + melden één minder of meer; het component zelf verandert niets', async () => {
    const wrapper = mountStepper({ count: 2 })

    await up(wrapper).trigger('click')
    await down(wrapper).trigger('click')

    expect(changes(wrapper)).toEqual([3, 1])
    expect(value(wrapper).element.value).toBe('2')
    wrapper.unmount()
  })

  it('grenzen: bij 1 kan − niet (weghalen gaat met ✕), bij 99 kan + niet', async () => {
    const one = mountStepper({ count: 1 })
    expect(down(one).attributes('disabled')).toBeDefined()
    expect(up(one).attributes('disabled')).toBeUndefined()
    one.unmount()

    const max = mountStepper({ count: 99 })
    expect(up(max).attributes('disabled')).toBeDefined()
    expect(down(max).attributes('disabled')).toBeUndefined()
    max.unmount()
  })

  it('disabled (offline of afgevinkt): beide knoppen en het getal uit', () => {
    const wrapper = mountStepper({ count: 5, disabled: true })

    for (const control of wrapper.findAll('button, input')) {
      expect(control.attributes('disabled')).toBeDefined()
    }
    wrapper.unmount()
  })

  it('het getal is een numeriek veld; tikken selecteert het, Enter slaat op', async () => {
    const wrapper = mountStepper({ count: 2 })
    const input = value(wrapper)
    expect(input.attributes('inputmode')).toBe('numeric')

    input.element.focus()
    expect(input.element.selectionStart).toBe(0)
    expect(input.element.selectionEnd).toBe(1)

    await input.setValue('12')
    await input.trigger('keydown', { key: 'Enter' })

    expect(changes(wrapper)).toEqual([12])
    expect(document.activeElement).not.toBe(input.element)
    wrapper.unmount()
  })

  it('weg tikken (blur) slaat ook op', async () => {
    const wrapper = mountStepper({ count: 2 })

    const input = await typeCount(wrapper, '7')
    input.element.blur()

    expect(changes(wrapper)).toEqual([7])
    wrapper.unmount()
  })

  it('Escape annuleert, ook als er daarna een blur komt', async () => {
    const wrapper = mountStepper({ count: 2 })

    const input = await typeCount(wrapper, '8')
    await input.trigger('keydown', { key: 'Escape' })
    await input.trigger('blur')

    expect(changes(wrapper)).toEqual([])
    expect(input.element.value).toBe('2')
    expect(document.activeElement).not.toBe(input.element)
    wrapper.unmount()
  })

  it('intypen: 0 wordt 1, meer dan 99 wordt 99; leeg, tekst of hetzelfde getal doet niets', async () => {
    const cases = [
      ['0', [1]],
      ['150', [99]],
      ['', []],
      ['twee', []],
      ['1,5', []],
      ['2', []],
    ]
    for (const [text, expected] of cases) {
      const wrapper = mountStepper({ count: 2 })
      const input = await typeCount(wrapper, text)
      await input.trigger('keydown', { key: 'Enter' })
      expect(changes(wrapper), `"${text}"`).toEqual(expected)
      wrapper.unmount()
    }
  })

  it('volgt count van buiten: na een mislukte opslag staat het oude getal er weer', async () => {
    const wrapper = mountStepper({ count: 2 })

    // De store zet het aantal optimistisch op 3 en bij een fout terug op 2.
    await wrapper.setProps({ count: 3 })
    expect(value(wrapper).element.value).toBe('3')
    await wrapper.setProps({ count: 2 })
    expect(value(wrapper).element.value).toBe('2')
    expect(down(wrapper).attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })
})
