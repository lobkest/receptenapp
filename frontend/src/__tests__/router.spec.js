import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { routes, requireAdmin, scrollBehavior } from '../router'
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

  it('stuurt de versiepagina zonder code naar het inlogscherm', async () => {
    const router = makeRouter()
    await router.push('/beheer/recepten/5/versies')

    expect(router.currentRoute.value.name).toBe('admin')
  })

  it('laat de versiepagina door met een code, zonder die in de URL te zetten', async () => {
    useAdminStore().code = 'geheim'
    const router = makeRouter()
    await router.push('/beheer/recepten/5/versies')

    expect(router.currentRoute.value.name).toBe('admin-recipe-versions')
    expect(router.currentRoute.value.fullPath).not.toContain('geheim')
  })

  it('laat bewerken voor iedereen door, zonder code', async () => {
    const router = makeRouter()
    await router.push('/recepten/5/bewerken')

    expect(router.currentRoute.value.name).toBe('recipe-edit')
  })

  it('stuurt een oude beheer-bewerklink door naar de openbare bewerkpagina', async () => {
    const router = makeRouter()
    await router.push('/beheer/recepten/5/bewerken')

    expect(router.currentRoute.value.fullPath).toBe('/recepten/5/bewerken')
  })

  it('laat openbare pagina’s altijd door', async () => {
    const router = makeRouter()
    await router.push('/recepten/nieuw')

    expect(router.currentRoute.value.name).toBe('recipe-new')
  })
})

describe('scrollBehavior', () => {
  const route = (path) => ({ path, matched: [{}] })
  const start = { path: '/', matched: [] }

  it('opent een nieuwe pagina bovenaan', async () => {
    expect(await scrollBehavior(route('/recepten/5'), route('/'), null)).toEqual({ top: 0 })
  })

  it('springt niet als alleen de query verandert (filter aan/uit)', async () => {
    expect(await scrollBehavior(route('/'), route('/'), null)).toBe(false)
  })

  it('begint bovenaan bij de eerste pagina', async () => {
    expect(await scrollBehavior(route('/'), start, null)).toEqual({ top: 0 })
  })

  it('geeft bij terug de oude positie, ook als de pagina nog kort is (na de wachttijd)', async () => {
    const saved = { left: 0, top: 999999 }
    expect(await scrollBehavior(route('/'), route('/recepten/5'), saved)).toBe(saved)
  })
})
