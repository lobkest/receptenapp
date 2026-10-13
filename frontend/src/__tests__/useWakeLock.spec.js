import { describe, it, expect, vi, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { useWakeLock } from '../composables/useWakeLock'

// Een composable werkt alleen binnen een component (onMounted/onUnmounted),
// dus testen we hem via een minimaal component dat de status toont.
const Probe = defineComponent({
  setup() {
    const { status } = useWakeLock()
    return () => h('p', status.value)
  },
})

// jsdom kent geen navigator.wakeLock; we zetten een nep-versie neer.
function fakeWakeLock(request) {
  Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true })
}

function fakeSentinel() {
  return {
    released: false,
    release: vi.fn(async function () {
      this.released = true
    }),
  }
}

function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('useWakeLock', () => {
  afterEach(() => {
    delete navigator.wakeLock
    delete document.visibilityState
  })

  it('valt netjes terug als de browser het niet ondersteunt', async () => {
    const wrapper = mount(Probe)
    await flushPromises()

    expect(wrapper.text()).toBe('unsupported')
    expect(() => wrapper.unmount()).not.toThrow()
  })

  it('vraagt het scherm-slot aan en geeft het vrij bij verlaten', async () => {
    const sentinel = fakeSentinel()
    const request = vi.fn().mockResolvedValue(sentinel)
    fakeWakeLock(request)

    const wrapper = mount(Probe)
    await flushPromises()

    expect(request).toHaveBeenCalledWith('screen')
    expect(wrapper.text()).toBe('active')

    wrapper.unmount()
    expect(sentinel.release).toHaveBeenCalled()
  })

  it('vraagt opnieuw aan als de pagina weer zichtbaar wordt', async () => {
    const first = fakeSentinel()
    const request = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(fakeSentinel())
    fakeWakeLock(request)
    const wrapper = mount(Probe)
    await flushPromises()

    // De browser laat het slot los als je de tab verlaat.
    first.released = true
    setVisibility('hidden')
    setVisibility('visible')
    await flushPromises()

    expect(request).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('vraagt niet opnieuw aan als het slot nog actief is', async () => {
    const request = vi.fn().mockResolvedValue(fakeSentinel())
    fakeWakeLock(request)
    const wrapper = mount(Probe)
    await flushPromises()

    setVisibility('visible')
    await flushPromises()

    expect(request).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('meldt een fout als de browser het weigert', async () => {
    fakeWakeLock(vi.fn().mockRejectedValue(new DOMException('Batterij', 'NotAllowedError')))

    const wrapper = mount(Probe)
    await flushPromises()

    expect(wrapper.text()).toBe('error')
    wrapper.unmount()
  })

  it('geeft een slot dat pas na verlaten binnenkomt meteen weer vrij', async () => {
    const sentinel = fakeSentinel()
    let resolve
    fakeWakeLock(vi.fn(() => new Promise((r) => (resolve = r))))

    const wrapper = mount(Probe)
    wrapper.unmount()
    resolve(sentinel)
    await flushPromises()

    expect(sentinel.release).toHaveBeenCalled()
  })

  it('luistert na verlaten niet meer naar zichtbaarheid', async () => {
    const request = vi.fn().mockResolvedValue(fakeSentinel())
    fakeWakeLock(request)
    const wrapper = mount(Probe)
    await flushPromises()
    wrapper.unmount()

    setVisibility('visible')
    await flushPromises()

    expect(request).toHaveBeenCalledTimes(1)
  })
})
