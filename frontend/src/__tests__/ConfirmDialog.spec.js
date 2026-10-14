import { describe, it, expect, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ConfirmDialog from '../components/ConfirmDialog.vue'

// attachTo: anders kan een knop in jsdom geen focus krijgen.
function mountDialog() {
  return mount(ConfirmDialog, { attachTo: document.body })
}

describe('ConfirmDialog', () => {
  let wrapper

  afterEach(() => wrapper?.unmount())

  it('is dicht tot ask() wordt aangeroepen', () => {
    wrapper = mountDialog()

    expect(wrapper.find('dialog').attributes('open')).toBeUndefined()
  })

  it('toont titel, tekst en de knoppen Annuleren en Verwijderen', async () => {
    wrapper = mountDialog()
    wrapper.vm.ask({ title: 'banaan verwijderen?', text: 'Dit kan niet ongedaan worden.' })
    await flushPromises()

    const dialog = wrapper.find('dialog')
    expect(dialog.attributes('open')).toBeDefined()
    expect(dialog.find('h2').text()).toBe('banaan verwijderen?')
    expect(dialog.find('.text').text()).toBe('Dit kan niet ongedaan worden.')
    expect(dialog.findAll('button').map((b) => b.text())).toEqual(['Annuleren', 'Verwijderen'])
    // Titel en tekst zijn gekoppeld, zodat een schermlezer ze voorleest.
    expect(document.getElementById(dialog.attributes('aria-labelledby')).textContent).toBe(
      'banaan verwijderen?',
    )
  })

  it('zet de focus op Annuleren', async () => {
    wrapper = mountDialog()
    wrapper.vm.ask({ title: 'Zeker?' })
    await flushPromises()

    expect(document.activeElement).toBe(wrapper.find('.cancel').element)
  })

  it('geeft true bij Verwijderen en sluit', async () => {
    wrapper = mountDialog()
    const answer = wrapper.vm.ask({ title: 'Zeker?' })
    await flushPromises()

    await wrapper.find('.confirm').trigger('click')

    expect(await answer).toBe(true)
    expect(wrapper.find('dialog').attributes('open')).toBeUndefined()
  })

  it('geeft false bij Annuleren', async () => {
    wrapper = mountDialog()
    const answer = wrapper.vm.ask({ title: 'Zeker?' })
    await flushPromises()

    await wrapper.find('.cancel').trigger('click')

    expect(await answer).toBe(false)
    expect(wrapper.find('dialog').attributes('open')).toBeUndefined()
  })

  it('sluit met Escape en geeft dan false', async () => {
    wrapper = mountDialog()
    const answer = wrapper.vm.ask({ title: 'Zeker?' })
    await flushPromises()

    await wrapper.find('dialog').trigger('keydown', { key: 'Escape' })

    expect(await answer).toBe(false)
    expect(wrapper.find('dialog').attributes('open')).toBeUndefined()
  })

  it('geeft ook false bij het cancel-event van de browser', async () => {
    wrapper = mountDialog()
    const answer = wrapper.vm.ask({ title: 'Zeker?' })
    await flushPromises()

    await wrapper.find('dialog').trigger('cancel')

    expect(await answer).toBe(false)
  })

  it('kan een andere tekst op de bevestigknop zetten', async () => {
    wrapper = mountDialog()
    wrapper.vm.ask({ title: 'Lijst legen?', confirmLabel: 'Wissen' })
    await flushPromises()

    expect(wrapper.find('.confirm').text()).toBe('Wissen')
  })
})
