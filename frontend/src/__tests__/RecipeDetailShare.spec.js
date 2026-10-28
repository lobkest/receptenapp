import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import { routes } from '../router'
import { jsonResponse, mockFetch } from './helpers'

// "Delen" op de receptpagina: het recept als tekst via het deelmenu, of anders naar het
// klembord. Zie src/utils/recipeText.js voor de tekst zelf.

const WOK = {
  id: 5,
  title: 'Wok',
  description: null,
  servings: 2,
  ingredients: [
    {
      id: 12,
      name: 'kip',
      quantity: 200,
      unit: 'g',
      optional: false,
      alternatives: [{ id: 3, name: 'tofu', effective_quantity: 250, effective_unit: 'g' }],
    },
  ],
  steps: [{ id: 1, position: 1, body: 'Bakken.' }],
}

async function mountAt(path) {
  mockFetch((method, url) => (url === '/api/recipes/5' ? jsonResponse(WOK) : jsonResponse([])))
  setActivePinia(createPinia())
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push(path)
  const wrapper = mount(RouterView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

// navigator.share bestaat in jsdom niet; navigator.clipboard ook niet. Per test erbij zetten.
function stubNavigator({ share, writeText } = {}) {
  vi.stubGlobal('navigator', {
    ...navigator,
    onLine: true,
    share,
    clipboard: writeText ? { writeText } : undefined,
  })
}

async function clickShare(wrapper) {
  await wrapper.find('.recipe-actions button.share').trigger('click')
  await flushPromises()
}

describe('RecipeDetailView: delen', () => {
  let wrapper

  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    wrapper?.unmount()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('opent het deelmenu met de tekst zoals je hem ziet: porties en wissel', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const writeText = vi.fn()
    stubNavigator({ share, writeText })
    wrapper = await mountAt('/recepten/5?wissel=12:3')
    await wrapper.find('button[aria-label="Meer porties"]').trigger('click')

    await clickShare(wrapper)

    expect(share).toHaveBeenCalledWith({
      title: 'Wok',
      text: 'Wok\n3 porties\n\nIngrediënten\n- 375 g tofu (of: 300 g kip)\n\nBereiding\n1. Bakken.',
    })
    expect(writeText).not.toHaveBeenCalled()
    // Het deelmenu laat zelf zien dat het gelukt is.
    expect(wrapper.find('.share-message').exists()).toBe(false)
  })

  it('doet niets als je het deelmenu wegklikt', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('weg', 'AbortError'))
    const writeText = vi.fn()
    stubNavigator({ share, writeText })
    wrapper = await mountAt('/recepten/5')

    await clickShare(wrapper)

    expect(writeText).not.toHaveBeenCalled()
    expect(wrapper.find('.share-message').exists()).toBe(false)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('kopieert naar het klembord als er geen deelmenu is', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubNavigator({ writeText })
    wrapper = await mountAt('/recepten/5')

    await clickShare(wrapper)

    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/^Wok\n2 porties\n/))
    expect(wrapper.find('.share-message').text()).toBe('Recept gekopieerd. Plak het waar je wilt.')
  })

  it('kopieert ook als het deelmenu om een andere reden mislukt', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('nee', 'NotAllowedError'))
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubNavigator({ share, writeText })
    wrapper = await mountAt('/recepten/5')

    await clickShare(wrapper)

    expect(writeText).toHaveBeenCalled()
    expect(wrapper.find('.share-message').exists()).toBe(true)
  })

  it('meldt het als ook kopiëren niet lukt', async () => {
    stubNavigator({ writeText: vi.fn().mockRejectedValue(new Error('geweigerd')) })
    wrapper = await mountAt('/recepten/5')

    await clickShare(wrapper)

    expect(wrapper.find('.recipe-actions [role="alert"]').text()).toBe(
      'Delen en kopiëren lukken niet in deze browser.',
    )
    expect(wrapper.find('.share-message').exists()).toBe(false)
  })

  it('meldt het ook zonder klembord', async () => {
    stubNavigator()
    wrapper = await mountAt('/recepten/5')

    await clickShare(wrapper)

    expect(wrapper.find('.recipe-actions [role="alert"]').exists()).toBe(true)
  })
})
