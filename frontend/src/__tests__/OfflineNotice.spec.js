import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import OfflineNotice from '../components/OfflineNotice.vue'
import { TICK_MS } from '../composables/useNow'
import { OFFLINE_TITLE } from '../offline'
import { useServerStatusStore } from '../stores/serverStatus'
import { setOffline } from './helpers'

// De offline-melding: overal regel 1 gelijk, regel 2 per pagina, extra uitleg eronder,
// "vandaag/gisteren" opnieuw berekend als de tijd verstrijkt, en een teller sinds wanneer
// de server niet online is (serverStatus.offlineSince).
const at = (...parts) => new Date(...parts).getTime()

function lines(wrapper) {
  return {
    title: wrapper.find('.offline-notice .offline-title').text(),
    detail: wrapper.find('.offline-notice .offline-detail').text(),
  }
}

describe('OfflineNotice', () => {
  let wrapper

  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    wrapper?.unmount()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const counter = () => wrapper.find('.offline-notice .offline-counter').text()

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
    expect(box.find('.pending').exists()).toBe(false)
    expect(box.text()).not.toContain('Afvinken')
    expect(wrapper.find('.offline-extra .pending').text()).toBe(
      '2 wijzigingen wachten op verbinding',
    )
    expect(wrapper.find('.offline-extra').text()).toContain('Afvinken kan gewoon.')
  })

  it('telt vanaf het starten elke seconde op; na 50 s "duurt langer dan normaal"', async () => {
    // De store begint bij het starten (status 'waking') met offlineSince = nu.
    const server = useServerStatusStore()
    expect(server.offline).toBe(true)
    wrapper = mount(OfflineNotice, { props: { savedAt: Date.now() } })
    expect(counter()).toBe('wachten op verbinding… 0 s (opstarten duurt meestal ~50 s)')

    await vi.advanceTimersByTimeAsync(12_000)
    expect(counter()).toBe('wachten op verbinding… 12 s (opstarten duurt meestal ~50 s)')

    await vi.advanceTimersByTimeAsync(51_000)
    expect(counter()).toBe('wachten op verbinding… 63 s (duurt langer dan normaal)')
  })

  it('toestel offline: "geen internet op dit toestel"', async () => {
    setOffline()
    wrapper = mount(OfflineNotice, { props: { savedAt: Date.now() } })
    await vi.advanceTimersByTimeAsync(12_000)
    expect(counter()).toMatch(/^geen internet op dit toestel · 12 s$/)
  })

  it('geen versienummer in de melding', () => {
    wrapper = mount(OfflineNotice, { props: { editing: true } })
    expect(wrapper.find('.offline-build').exists()).toBe(false)
    expect(wrapper.find('.offline-notice').text()).not.toContain('versie')
  })

  it('online: geen teller, en het interval is opgeruimd', async () => {
    const server = useServerStatusStore()
    wrapper = mount(OfflineNotice, { props: { editing: true } })
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    server.setStatus('online')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.offline-counter').exists()).toBe(false)
    wrapper.unmount()
    wrapper = null
    // Na unmount loopt er geen klok meer (de teller niet, en useNow ook niet).
    expect(vi.getTimerCount()).toBe(0)
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
