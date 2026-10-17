import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { APP_VERSION, handleServerVersion, isOutdated, resetVersionCheck } from '../version'
import { request } from '../api/client'

describe('versiecheck (oude bundel naast nieuwe API)', () => {
  beforeEach(() => {
    sessionStorage.clear()
    resetVersionCheck()
    // Zoals in een build; in development (DEV) doet de check niets.
    vi.stubEnv('DEV', false)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('heeft een versie uit de build (vite.config.js)', () => {
    expect(typeof APP_VERSION).toBe('string')
    expect(APP_VERSION.length).toBeGreaterThan(0)
  })

  it('isOutdated: alleen bij een andere versie, nooit zonder header', () => {
    expect(isOutdated('b', 'a')).toBe(true)
    expect(isOutdated('a', 'a')).toBe(false)
    expect(isOutdated(null, 'a')).toBe(false)
    expect(isOutdated('', 'a')).toBe(false)
  })

  it('herlaadt bij een andere versie, maar per serverversie maar één keer', () => {
    const reload = vi.fn()

    expect(handleServerVersion('nieuwer', { reload })).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)

    // Na herladen (nieuwe pagina, zelfde tabblad) nog steeds verschillend: niet nog eens.
    resetVersionCheck()
    expect(handleServerVersion('nieuwer', { reload })).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)

    // Weer een nieuwere deploy: dan wel.
    resetVersionCheck()
    expect(handleServerVersion('nog-nieuwer', { reload })).toBe(true)
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('herlaadt niet bij dezelfde versie of zonder header', () => {
    const reload = vi.fn()

    handleServerVersion(APP_VERSION, { reload })
    handleServerVersion(null, { reload })

    expect(reload).not.toHaveBeenCalled()
  })

  it('doet niets in development', () => {
    vi.stubEnv('DEV', true)
    const reload = vi.fn()

    expect(handleServerVersion('nieuwer', { reload })).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('de API-client geeft de header van elke response door, en vraagt nooit de cache', async () => {
    const fetch = vi.fn(
      async () =>
        new Response('[]', {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'X-App-Version': 'nieuwer' },
        }),
    )
    vi.stubGlobal('fetch', fetch)

    expect(await request('/api/tags')).toEqual([])
    expect(fetch.mock.calls[0][1].cache).toBe('no-store')
    // Herladen zelf kan jsdom niet; de markering laat zien dat het in gang is gezet.
    expect(sessionStorage.getItem('receptenapp:reloaded-for-version')).toBe('nieuwer')
  })
})
