import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import App from '../App.vue'
import { routes } from '../router'
import { useShoppingListStore } from '../stores/shoppingList'
import { useStandardItemsStore } from '../stores/standardItems'

const PANCAKES = { id: 1, title: 'Pannenkoeken' }

// Monteert de hele App op /winkelen, zodat "klaar" echt kan navigeren.
// TransitionGroup is in Vue Test Utils standaard gestubd: items verdwijnen meteen.
async function mountApp(fill = () => {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  fill(useShoppingListStore(), useStandardItemsStore())
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push('/winkelen')
  const wrapper = mount(App, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router }
}

// melk en kaas staan in de standaardlijst onder zuivel, bloem niet.
function fill(list, standard) {
  standard.add({ name: 'melk', quantity: 1000, unit: 'ml', category: 'zuivel' })
  standard.add({ name: 'kaas', category: 'zuivel' })
  list.add({ name: 'melk', quantity: 200, unit: 'ml' }, PANCAKES)
  list.add({ name: 'bloem', quantity: 250, unit: 'g' }, PANCAKES)
  list.add({ name: 'kaas', quantity: 100, unit: 'g' }, PANCAKES)
  list.add({ name: 'zout', quantity: null, unit: null }, PANCAKES)
}

function openNames(wrapper) {
  return wrapper.findAll('.items .name').map((n) => n.text())
}

function basketNames(wrapper) {
  return wrapper.findAll('.basket-items .name').map((n) => n.text())
}

function pickButton(wrapper, name) {
  return wrapper.findAll('.pick').find((b) => b.find('.name').text() === name)
}

describe('ShoppingModeView', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('toont alleen de nog niet afgevinkte items', async () => {
    const { wrapper } = await mountApp((list, standard) => {
      fill(list, standard)
      list.toggle(list.items.find((i) => i.name === 'bloem').key)
    })

    expect(openNames(wrapper)).toEqual(['kaas', 'melk', 'zout'])
    expect(wrapper.find('.progress').text()).toBe('Nog 3 te halen')
  })

  it('groepeert per categorie uit de standaardlijst, de rest onder "overig"', async () => {
    const { wrapper } = await mountApp(fill)

    const groups = wrapper
      .findAll('.group')
      .map((g) => [g.find('h2').text(), g.findAll('.name').map((n) => n.text())])
    expect(groups).toEqual([
      ['zuivel', ['kaas', 'melk']],
      ['overig', ['bloem', 'zout']],
    ])
  })

  it('toont hoeveelheid en een duidelijk label per item', async () => {
    const { wrapper } = await mountApp(fill)

    expect(pickButton(wrapper, 'melk').find('.amount').text()).toBe('200 ml')
    expect(pickButton(wrapper, 'melk').attributes('aria-label')).toBe('melk, 200 ml: in mandje')
    expect(pickButton(wrapper, 'zout').find('.amount').exists()).toBe(false)
  })

  it('tikken legt een item in het mandje, ook in localStorage', async () => {
    const { wrapper } = await mountApp(fill)

    await pickButton(wrapper, 'melk').trigger('click')

    expect(openNames(wrapper)).toEqual(['kaas', 'bloem', 'zout'])
    expect(wrapper.find('.basket summary').text()).toBe('In mandje (1)')
    expect(basketNames(wrapper)).toEqual(['melk'])
    const stored = JSON.parse(localStorage.getItem('shoppingList')).items
    expect(stored.find((i) => i.name === 'melk').checked).toBe(true)
  })

  it('het mandje is standaard ingeklapt', async () => {
    const { wrapper } = await mountApp(fill)
    await pickButton(wrapper, 'melk').trigger('click')

    expect(wrapper.find('details.basket').attributes('open')).toBeUndefined()
  })

  it('maakt ongedaan via de melding', async () => {
    const { wrapper } = await mountApp(fill)
    await pickButton(wrapper, 'melk').trigger('click')

    expect(wrapper.find('.undo-bar').text()).toContain('melk in mandje')
    await wrapper.find('.undo').trigger('click')

    expect(openNames(wrapper)).toContain('melk')
    expect(wrapper.find('.basket').exists()).toBe(false)
    expect(wrapper.find('.undo').exists()).toBe(false)
  })

  it('zet een item terug vanuit het mandje', async () => {
    const { wrapper } = await mountApp(fill)
    await pickButton(wrapper, 'bloem').trigger('click')
    await pickButton(wrapper, 'melk').trigger('click')

    await wrapper
      .findAll('.put-back')
      .find((b) => b.text().includes('bloem'))
      .trigger('click')

    expect(basketNames(wrapper)).toEqual(['melk'])
    expect(openNames(wrapper)).toContain('bloem')
    // De melding hoort bij melk en blijft dus staan.
    expect(wrapper.find('.undo-bar').text()).toContain('melk in mandje')
  })

  it('laat de melding na 5 seconden weer verdwijnen', async () => {
    vi.useFakeTimers()
    const { wrapper } = await mountApp(fill)
    await pickButton(wrapper, 'melk').trigger('click')

    await vi.advanceTimersByTimeAsync(4999)
    expect(wrapper.find('.undo').exists()).toBe(true)
    await vi.advanceTimersByTimeAsync(1)
    expect(wrapper.find('.undo').exists()).toBe(false)
  })

  it('meldt als alles in het mandje zit', async () => {
    const { wrapper } = await mountApp((list) => {
      list.add({ name: 'melk', quantity: 1, unit: 'ml' }, PANCAKES)
    })
    await pickButton(wrapper, 'melk').trigger('click')

    expect(wrapper.find('.all-done').text()).toBe('Alles in je mandje!')
    expect(wrapper.find('.progress').exists()).toBe(false)
  })

  it('wist afgevinkte items na bevestiging en gaat terug naar de lijst', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { wrapper, router } = await mountApp(fill)
    await pickButton(wrapper, 'melk').trigger('click')

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Klaar: afgevinkte wissen')
      .trigger('click')
    await flushPromises()

    expect(window.confirm).toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/boodschappen')
    expect(useShoppingListStore().items.map((i) => i.name)).toEqual(['bloem', 'kaas', 'zout'])
  })

  it('doet niets als je de bevestiging annuleert', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { wrapper, router } = await mountApp(fill)
    await pickButton(wrapper, 'melk').trigger('click')

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Klaar: afgevinkte wissen')
      .trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/winkelen')
    expect(useShoppingListStore().items).toHaveLength(4)
  })

  it('toont de klaar-knop pas als er iets in het mandje zit', async () => {
    const { wrapper } = await mountApp(fill)

    expect(wrapper.findAll('button').some((b) => b.text() === 'Klaar: afgevinkte wissen')).toBe(
      false,
    )
  })

  it('verwijst naar /boodschappen bij een lege lijst', async () => {
    const { wrapper } = await mountApp()

    expect(wrapper.find('.empty').text()).toContain('leeg')
    expect(wrapper.find('.empty a').attributes('href')).toBe('/boodschappen')
  })

  it('meldt dat het scherm kan uitgaan zonder wake-lock-ondersteuning', async () => {
    const { wrapper } = await mountApp(fill)

    expect(wrapper.find('.wake-status').attributes('data-status')).toBe('unsupported')
    expect(wrapper.find('.wake-status').text()).toContain('kan uitgaan')
  })
})
