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

describe('CountStepper', () => {
  it('toont het getal altijd, ook bij 1, met duidelijke labels', () => {
    const wrapper = mountStepper({ count: 1 })

    expect(value(wrapper).text()).toBe('1')
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
    expect(value(wrapper).text()).toBe('2')
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

  it('disabled (offline of afgevinkt): beide knoppen uit, het getal gedimd', () => {
    const wrapper = mountStepper({ count: 5, disabled: true })

    for (const button of wrapper.findAll('button')) {
      expect(button.attributes('disabled')).toBeDefined()
    }
    expect(wrapper.find('.stepper').classes()).toContain('disabled')
    wrapper.unmount()
  })

  it('het getal is gewone tekst, geen invoerveld: aanpassen kan alleen met − en +', () => {
    const wrapper = mountStepper({ count: 2 })

    expect(wrapper.find('input').exists()).toBe(false)
    expect(value(wrapper).element.tagName).toBe('SPAN')
    expect(value(wrapper).attributes('aria-live')).toBe('polite')
    wrapper.unmount()
  })

  it('volgt count van buiten: na een mislukte opslag staat het oude getal er weer', async () => {
    const wrapper = mountStepper({ count: 2 })

    // De store zet het aantal optimistisch op 3 en bij een fout terug op 2.
    await wrapper.setProps({ count: 3 })
    expect(value(wrapper).text()).toBe('3')
    await wrapper.setProps({ count: 2 })
    expect(value(wrapper).text()).toBe('2')
    expect(down(wrapper).attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })
})
