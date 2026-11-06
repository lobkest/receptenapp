import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { jsonResponse, mockFetch } from './helpers'
import { clearMemoryStorage } from '../offline/storage'
import { resetServerStatus } from '../stores/serverStatus'
import { mountRoute } from './mount'

// De strook achter de statusbalk (#status-bar-backdrop, index.html) krijgt is-scrolled
// zodra de sentinel bovenaan uit beeld is (IntersectionObserver in App.vue). jsdom heeft
// geen IntersectionObserver: deze nep-versie onthoudt de callback, zodat de test zelf
// "in beeld" of "uit beeld" kan melden. Het echte scrollen staat in e2e/status-bar.spec.js.
class FakeObserver {
  static instances = []
  constructor(callback) {
    this.callback = callback
    this.targets = []
    this.disconnect = vi.fn()
    FakeObserver.instances.push(this)
  }
  observe(target) {
    this.targets.push(target)
  }
  report(isIntersecting) {
    this.callback(this.targets.map((target) => ({ target, isIntersecting })))
  }
}

describe('App: strook achter de statusbalk', () => {
  let wrapper
  let backdrop

  beforeEach(() => {
    localStorage.clear()
    clearMemoryStorage()
    resetServerStatus()
    FakeObserver.instances = []
    vi.stubGlobal('IntersectionObserver', FakeObserver)
    // Een lege receptenpagina en boodschappenlijst; de rest bestaat niet.
    const lists = ['/api/recipes', '/api/tags', '/api/categories', '/api/shopping_list_items']
    mockFetch((method, url) =>
      lists.some((path) => url.split('?')[0] === path) ? jsonResponse([]) : jsonResponse({}, 404),
    )
    // Staat in index.html, buiten #app: in de test zelf toevoegen.
    backdrop = document.createElement('div')
    backdrop.id = 'status-bar-backdrop'
    document.body.prepend(backdrop)
  })

  afterEach(() => {
    wrapper?.unmount()
    backdrop.remove()
    resetServerStatus()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('zet is-scrolled zodra de sentinel uit beeld is, en haalt hem bovenaan weer weg', async () => {
    ;({ wrapper } = await mountRoute('/', { app: true, attach: true }))
    const [observer] = FakeObserver.instances
    expect(observer.targets).toEqual([wrapper.find('.scroll-sentinel').element])

    observer.report(true)
    expect(backdrop.classList.contains('is-scrolled')).toBe(false)
    observer.report(false)
    expect(backdrop.classList.contains('is-scrolled')).toBe(true)
    observer.report(true)
    expect(backdrop.classList.contains('is-scrolled')).toBe(false)
  })

  it('ruimt de observer op bij unmount', async () => {
    ;({ wrapper } = await mountRoute('/', { app: true, attach: true }))
    const [observer] = FakeObserver.instances
    wrapper.unmount()
    wrapper = null
    expect(observer.disconnect).toHaveBeenCalled()
  })
})
