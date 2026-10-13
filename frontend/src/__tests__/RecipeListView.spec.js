import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import RecipeListView from '../views/RecipeListView.vue'

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mountView() {
  return mount(RecipeListView, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
}

describe('RecipeListView', () => {
  beforeEach(() => {
    // Elke test een verse store, zodat er geen lijst uit een vorige test blijft hangen.
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('toont een laadtekst zolang de API nog niet geantwoord heeft', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Recepten laden…')
  })

  it('toont een foutmelding als de server niet bereikbaar is', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Kan de server niet bereiken.')
    expect(wrapper.find('button').text()).toBe('Opnieuw proberen')
  })

  it('toont een foutmelding bij een serverfout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 500)))
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Er ging iets mis op de server.')
  })

  it('toont een lege-staat-tekst als er nog geen recepten zijn', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([])))
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Er zijn nog geen recepten.')
    expect(wrapper.find('ul').exists()).toBe(false)
  })

  it('toont de recepten met titel, porties en link', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse([
          { id: 1, title: 'Pannenkoeken', servings: 4 },
          { id: 2, title: 'Tosti', servings: 1 },
        ]),
      ),
    )
    const wrapper = mountView()
    await flushPromises()

    const items = wrapper.findAll('li')
    expect(items).toHaveLength(2)
    expect(items[0].text()).toContain('Pannenkoeken')
    expect(items[0].text()).toContain('4 porties')
    expect(items[1].text()).toContain('1 portie')
    expect(wrapper.findAllComponents(RouterLinkStub)[0].props('to')).toBe('/recepten/1')
    expect(fetch).toHaveBeenCalledWith('/api/recipes', expect.anything())
  })
})
