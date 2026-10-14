import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAdminStore } from '../stores/admin'
import { fetchDeletionRequests } from '../api/admin'
import { jsonResponse, mockFetch, authHeaderOf } from './helpers'

const CODE = 'geheime-code-123'

describe('admin-API en admin-store', () => {
  beforeEach(() => {
    sessionStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('stuurt de code als Bearer-token in de Authorization-header, niet in de URL', async () => {
    const fetch = mockFetch(() => jsonResponse([]))
    await fetchDeletionRequests(CODE)

    const [url] = fetch.mock.calls[0]
    expect(url).toBe('/api/admin/deletion_requests')
    expect(authHeaderOf(fetch.mock.calls[0])).toBe(`Bearer ${CODE}`)
  })

  it('logt in met een geldige code (gecontroleerd via de verwijderverzoeken) en bewaart die', async () => {
    const fetch = mockFetch(() => jsonResponse([]))
    const admin = useAdminStore()
    await admin.login(CODE)

    expect(fetch.mock.calls[0][0]).toBe('/api/admin/deletion_requests')
    expect(admin.isLoggedIn).toBe(true)
    expect(sessionStorage.getItem('adminCode')).toBe(CODE)
    expect(localStorage.getItem('adminCode')).toBeNull()
  })

  it('logt niet in bij een 401 en bewaart dan niets', async () => {
    mockFetch(() => jsonResponse({ error: 'Unauthorized' }, 401))
    const admin = useAdminStore()

    await expect(admin.login('fout')).rejects.toMatchObject({ kind: 'unauthorized' })
    expect(admin.isLoggedIn).toBe(false)
    expect(sessionStorage.getItem('adminCode')).toBeNull()
  })

  it('leest een eerder opgeslagen code uit sessionStorage', () => {
    sessionStorage.setItem('adminCode', CODE)
    expect(useAdminStore().isLoggedIn).toBe(true)
  })

  it('logt automatisch uit bij een latere 401', async () => {
    mockFetch(() => jsonResponse({ error: 'Unauthorized' }, 401))
    sessionStorage.setItem('adminCode', CODE)
    const admin = useAdminStore()

    await expect(admin.restore(1)).rejects.toMatchObject({ kind: 'unauthorized' })
    expect(admin.isLoggedIn).toBe(false)
    expect(sessionStorage.getItem('adminCode')).toBeNull()
  })

  it('gebruikt de juiste endpoints en ververst daarna de openbare lijst en tags', async () => {
    const fetch = mockFetch((method) =>
      method === 'DELETE' ? new Response(null, { status: 204 }) : jsonResponse({ id: 1 }),
    )
    const admin = useAdminStore()
    admin.code = CODE

    await admin.destroy(1)
    await admin.restore(2)
    await admin.fetchVersions(3)
    await admin.restoreVersion(3, 7)

    const calls = fetch.mock.calls.map(([url, options]) => `${options.method ?? 'GET'} ${url}`)
    expect(calls).toEqual(
      expect.arrayContaining([
        'DELETE /api/admin/recipes/1',
        'PATCH /api/admin/recipes/2/restore',
        'GET /api/admin/recipes/3/versions',
        'POST /api/admin/recipes/3/versions/7/restore',
        'GET /api/recipes',
        'GET /api/tags',
      ]),
    )
  })

  it('zet de code nooit in een URL', async () => {
    const fetch = mockFetch((method) =>
      method === 'DELETE' ? new Response(null, { status: 204 }) : jsonResponse({ id: 1 }),
    )
    const admin = useAdminStore()
    await admin.login(CODE)
    await admin.fetchDeletionRequests()
    await admin.destroy(1)
    await admin.restore(1)
    await admin.fetchVersions(1)
    await admin.restoreVersion(1, 2)

    for (const [url] of fetch.mock.calls) {
      expect(url).not.toContain(CODE)
    }
  })
})
