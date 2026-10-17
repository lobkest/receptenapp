import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  PING_TIMEOUT_MS,
  RETRY_DELAYS_MS,
  SLOW_MS,
  resetServerStatus,
  useServerStatusStore,
} from '../stores/serverStatus'

// Nep-fetch voor /up: elke aanroep neemt het volgende antwoord uit answers.
// 'ok' → 200, 'error' → 503, 'network' → fetch faalt (TypeError), 'hang' → nooit een
// antwoord (tot de AbortController de time-out geeft).
function fakeUp(...answers) {
  const fake = vi.fn((url, { signal } = {}) => {
    const answer = answers.length > 1 ? answers.shift() : answers[0]
    if (answer === 'ok') return Promise.resolve(new Response('', { status: 200 }))
    if (answer === 'error') return Promise.resolve(new Response('', { status: 503 }))
    if (answer === 'network') return Promise.reject(new TypeError('Failed to fetch'))
    return new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })
  })
  vi.stubGlobal('fetch', fake)
  return fake
}

describe('serverStatus-store', () => {
  let server

  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    resetServerStatus()
    server = useServerStatusStore()
  })

  afterEach(() => {
    resetServerStatus()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('begint als waking, en is online zodra /up 200 geeft', async () => {
    const fetch = fakeUp('ok')
    expect(server.status).toBe('waking')
    expect(server.online).toBe(false)

    await server.start()

    expect(server.status).toBe('online')
    expect(server.online).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][0]).toBe('/up')
    // Nooit uit een cache.
    expect(fetch.mock.calls[0][1].cache).toBe('no-store')
  })

  it('blijft waking bij een 5xx (Render start op), en probeert opnieuw tot online', async () => {
    const fetch = fakeUp('error', 'error', 'ok')

    await server.start()
    expect(server.status).toBe('waking')

    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0])
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(server.status).toBe('waking')

    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[1])
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(server.status).toBe('online')

    // Online: geen nieuwe pings meer.
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('gaat naar offline als fetch faalt, en daarna toch naar online', async () => {
    const fetch = fakeUp('network', 'ok')

    await server.start()
    expect(server.status).toBe('offline')

    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0])
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(server.status).toBe('online')
  })

  it('wacht steeds langer tussen pogingen (backoff), tot het maximum', async () => {
    const fetch = fakeUp('network')
    await server.start()

    let calls = 1
    for (const delay of [...RETRY_DELAYS_MS, RETRY_DELAYS_MS.at(-1)]) {
      await vi.advanceTimersByTimeAsync(delay - 1)
      expect(fetch).toHaveBeenCalledTimes(calls)
      await vi.advanceTimersByTimeAsync(1)
      expect(fetch).toHaveBeenCalledTimes(++calls)
    }
    expect(server.status).toBe('offline')
  })

  it('geeft elk verzoek een time-out: zonder antwoord blijft hij waking en probeert opnieuw', async () => {
    const fetch = fakeUp('hang', 'ok')

    server.start()
    await vi.advanceTimersByTimeAsync(PING_TIMEOUT_MS - 1)
    expect(server.status).toBe('waking')
    expect(fetch).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true)
    expect(server.status).toBe('waking')

    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0])
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(server.status).toBe('online')
  })

  it('pingt niet als de browser offline is, en is dan meteen offline', async () => {
    const fetch = fakeUp('ok')
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)

    await server.start()

    expect(server.status).toBe('offline')
    expect(server.browserOffline).toBe(true)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('markOffline: de browser meldt dat de verbinding weg is', () => {
    server.markOffline()

    expect(server.status).toBe('offline')
    expect(server.browserOffline).toBe(true)
  })

  it('pingt maar één keer als start twee keer tegelijk komt', async () => {
    const fetch = fakeUp('ok')

    await Promise.all([server.start(), server.start()])

    expect(fetch).toHaveBeenCalledTimes(1)
  })

  describe('terug naar het tabblad', () => {
    it('blijft online als de server snel antwoordt', async () => {
      fakeUp('ok')
      await server.start()

      server.start()
      expect(server.status).toBe('online')
      await vi.advanceTimersByTimeAsync(0)
      expect(server.status).toBe('online')
    })

    it('gaat naar waking als het antwoord lang uitblijft (de server sliep), daarna online', async () => {
      const fetch = fakeUp('ok', 'hang', 'ok')
      await server.start()

      server.start()
      await vi.advanceTimersByTimeAsync(SLOW_MS - 1)
      expect(server.status).toBe('online')
      await vi.advanceTimersByTimeAsync(1)
      expect(server.status).toBe('waking')

      await vi.advanceTimersByTimeAsync(PING_TIMEOUT_MS + RETRY_DELAYS_MS[0])
      expect(fetch).toHaveBeenCalledTimes(3)
      expect(server.status).toBe('online')
    })

    it('begint de backoff opnieuw', async () => {
      const fetch = fakeUp('network')
      await server.start()
      // Een paar mislukte pogingen: de volgende wachttijd is al lang.
      await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0] + RETRY_DELAYS_MS[1])
      expect(fetch).toHaveBeenCalledTimes(3)

      await server.start()
      expect(fetch).toHaveBeenCalledTimes(4)
      await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0])
      expect(fetch).toHaveBeenCalledTimes(5)
    })
  })
})
