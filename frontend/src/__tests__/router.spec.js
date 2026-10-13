import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { routes, requireAdmin } from '../router'
import { useAdminStore } from '../stores/admin'

function makeRouter() {
  const router = createRouter({ history: createMemoryHistory(), routes })
  router.beforeEach(requireAdmin)
  return router
}

describe('route guard voor beheer', () => {
  beforeEach(() => {
    sessionStorage.clear()
    setActivePinia(createPinia())
  })

  it('stuurt de bewerkpagina zonder code naar het inlogscherm', async () => {
    const router = makeRouter()
    await router.push('/beheer/recepten/5/bewerken')

    expect(router.currentRoute.value.name).toBe('admin')
  })

  it('laat de bewerkpagina door met een code, zonder die in de URL te zetten', async () => {
    useAdminStore().code = 'geheim'
    const router = makeRouter()
    await router.push('/beheer/recepten/5/bewerken')

    expect(router.currentRoute.value.name).toBe('admin-recipe-edit')
    expect(router.currentRoute.value.fullPath).not.toContain('geheim')
  })

  it('laat openbare pagina’s altijd door', async () => {
    const router = makeRouter()
    await router.push('/recepten/nieuw')

    expect(router.currentRoute.value.name).toBe('recipe-new')
  })
})
