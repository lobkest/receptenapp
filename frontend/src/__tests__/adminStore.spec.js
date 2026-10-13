import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAdminStore } from '../stores/admin'
import { fetchAdminRecipes } from '../api/admin'
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
    await fetchAdminRecipes(CODE, 'pending')

    const [url] = fetch.mock.calls[0]
    expect(url).toBe('/api/admin/recipes?status=pending')
    expect(authHeaderOf(fetch.mock.calls[0])).toBe(`Bearer ${CODE}`)
  })

  it('laat ?status= weg voor alle recepten', async () => {
    const fetch = mockFetch(() => jsonResponse([]))
    await fetchAdminRecipes(CODE, '')

    expect(fetch.mock.calls[0][0]).toBe('/api/admin/recipes')
  })

  it('logt in met een geldige code en bewaart die in sessionStorage', async () => {
    mockFetch(() => jsonResponse([]))
    const admin = useAdminStore()
    await admin.login(CODE)

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

    await expect(admin.approve(1)).rejects.toMatchObject({ kind: 'unauthorized' })
    expect(admin.isLoggedIn).toBe(false)
    expect(sessionStorage.getItem('adminCode')).toBeNull()
  })

  it('ververst de openbare receptenlijst na goedkeuren', async () => {
    const fetch = mockFetch((method, url) =>
      url === '/api/recipes'
        ? jsonResponse([{ id: 1, title: 'Soep', servings: 2 }])
        : jsonResponse({ id: 1, status: 'approved' }),
    )
    const admin = useAdminStore()
    admin.code = CODE
    await admin.approve(1)

    expect(fetch).toHaveBeenCalledWith('/api/admin/recipes/1/approve', expect.anything())
    expect(fetch).toHaveBeenCalledWith('/api/recipes', expect.anything())
  })

  it('zet de code nooit in een URL', async () => {
    const fetch = mockFetch((method) =>
      method === 'DELETE' ? new Response(null, { status: 204 }) : jsonResponse({ id: 1 }),
    )
    const admin = useAdminStore()
    await admin.login(CODE)
    await admin.fetchRecipes('approved')
    await admin.fetchRecipe(1)
    await admin.updateRecipe(1, { title: 'x' })
    await admin.approve(1)
    await admin.reject(1)
    await admin.destroy(1)

    for (const [url] of fetch.mock.calls) {
      expect(url).not.toContain(CODE)
    }
  })
})
