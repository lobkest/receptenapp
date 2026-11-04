import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import OfflineNotice from '../components/OfflineNotice.vue'
import { TICK_MS } from '../composables/useNow'
import { OFFLINE_TITLE } from '../offline'
import { APP_VERSION } from '../version'

// De offline-melding: overal regel 1 gelijk, regel 2 per pagina, extra uitleg eronder, en
// "vandaag/gisteren" opnieuw berekend als de tijd verstrijkt.
const at = (...parts) => new Date(...parts).getTime()

function lines(wrapper) {
  return {
    title: wrapper.find('.offline-notice .offline-title').text(),
    detail: wrapper.find('.offline-notice .offline-detail').text(),
  }
}

describe('OfflineNotice', () => {
  let wrapper

  beforeEach(() => vi.useFakeTimers())

  afterEach(() => {
    wrapper?.unmount()
    vi.useRealTimers()
  })

  it('regel 1 is overal gelijk; regel 2 per soort pagina', () => {
    vi.setSystemTime(new Date(2026, 10, 3, 22, 0))
    const cases = [
      [{ savedAt: at(2026, 10, 3, 21, 57) }, 'kopie van vandaag 21:57'],
      [{ savedAt: at(2026, 10, 2, 18, 0) }, 'kopie van gisteren 18:00'],
      [{ savedAt: at(2026, 10, 1, 18, 0) }, 'kopie van 2 dagen geleden'],
      [{ unavailable: 'In huis' }, 'In huis is offline niet beschikbaar'],
      [{ editing: true }, 'opslaan kan weer zodra er verbinding is'],
    ]
    for (const [props, detail] of cases) {
      wrapper = mount(OfflineNotice, { props })
      expect(lines(wrapper)).toEqual({ title: OFFLINE_TITLE, detail })
      wrapper.unmount()
    }
    wrapper = null
  })

  it('wachtende wijzigingen en extra uitleg staan onder het blok, niet erin', () => {
    wrapper = mount(OfflineNotice, {
      props: { savedAt: Date.now(), pending: 2 },
      slots: { default: 'Afvinken kan gewoon.' },
    })
    const box = wrapper.find('.offline-notice')
    expect(box.text()).not.toContain('wachten')
    expect(box.text()).not.toContain('Afvinken')
    expect(wrapper.find('.offline-extra .pending').text()).toBe(
      '2 wijzigingen wachten op verbinding',
    )
    expect(wrapper.find('.offline-extra').text()).toContain('Afvinken kan gewoon.')
  })

  it('toont klein welke build er draait', () => {
    wrapper = mount(OfflineNotice, { props: { editing: true } })
    expect(wrapper.find('.offline-notice .offline-build').text()).toContain(APP_VERSION.slice(0, 7))
  })

  it('app blijft open over middernacht: "vandaag" wordt vanzelf "gisteren"', async () => {
    vi.setSystemTime(new Date(2026, 10, 3, 23, 40))
    wrapper = mount(OfflineNotice, { props: { savedAt: at(2026, 10, 3, 23, 30) } })
    expect(lines(wrapper).detail).toBe('kopie van vandaag 23:30')

    // 30 minuten later (4 nov 00:10), zonder dat er iets anders verandert.
    await vi.advanceTimersByTimeAsync(30 * TICK_MS)
    expect(lines(wrapper).detail).toBe('kopie van gisteren 23:30')
  })

  it('terug naar de app na middernacht: meteen opnieuw berekend', async () => {
    vi.setSystemTime(new Date(2026, 10, 3, 23, 40))
    wrapper = mount(OfflineNotice, { props: { savedAt: at(2026, 10, 3, 23, 30) } })

    // De telefoon lag op de achtergrond (timers stonden stil); de klok sprong vooruit.
    vi.setSystemTime(new Date(2026, 10, 4, 0, 10))
    document.dispatchEvent(new Event('visibilitychange'))
    await wrapper.vm.$nextTick()
    expect(lines(wrapper).detail).toBe('kopie van gisteren 23:30')
  })
})
