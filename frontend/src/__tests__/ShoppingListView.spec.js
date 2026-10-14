import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import App from '../App.vue'
import { routes } from '../router'
import { useShoppingListStore } from '../stores/shoppingList'

const PANCAKES = { id: 1, title: 'Pannenkoeken' }
const WAFFLES = { id: 2, title: 'Wafels' }

// Monteert de hele App, zodat we ook het menu (met het aantal) kunnen testen.
async function mountApp(fill = () => {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  fill(useShoppingListStore())
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push('/boodschappen')
  const wrapper = mount(App, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return wrapper
}

function fillTwo(list) {
  list.add({ name: 'bloem', quantity: 200, unit: 'g' }, PANCAKES)
  list.add({ name: 'bloem', quantity: 100, unit: 'g' }, WAFFLES)
  list.add({ name: 'zout', quantity: null, unit: null }, PANCAKES)
}

function buttonWithText(wrapper, text) {
  return wrapper.findAll('button').find((b) => b.text() === text)
}

describe('ShoppingListView', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('toont een lege lijst', async () => {
    const wrapper = await mountApp()

    expect(wrapper.find('.empty').text()).toContain('leeg')
    expect(wrapper.find('.shopping-link').text()).toBe('Boodschappen')
  })

  it('toont regels met hoeveelheid en herkomst', async () => {
    const wrapper = await mountApp(fillTwo)

    expect(wrapper.findAll('.items .line').map((l) => l.text())).toEqual(['300 g bloem', 'zout'])
    expect(wrapper.findAll('.items .sources').map((s) => s.text())).toEqual([
      'uit: Pannenkoeken, Wafels',
      'uit: Pannenkoeken',
    ])
  })

  it('toont het aantal open regels in het menu', async () => {
    const wrapper = await mountApp(fillTwo)

    expect(wrapper.find('.shopping-link').text()).toBe('Boodschappen (2)')
  })

  it('vinkt af (doorgestreept) en werkt het menu-aantal bij', async () => {
    const wrapper = await mountApp(fillTwo)

    await wrapper.find('.items input[type="checkbox"]').setValue(true)

    expect(wrapper.findAll('.items li')[0].classes()).toContain('checked')
    expect(wrapper.find('.shopping-link').text()).toBe('Boodschappen (1)')
    expect(JSON.parse(localStorage.getItem('shoppingList')).items[0].checked).toBe(true)
  })

  it('verwijdert één regel', async () => {
    const wrapper = await mountApp(fillTwo)

    await wrapper.find('.items .remove').trigger('click')

    expect(wrapper.findAll('.items .line').map((l) => l.text())).toEqual(['zout'])
  })

  it('wist afgevinkte regels zonder te vragen', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    const wrapper = await mountApp(fillTwo)

    expect(buttonWithText(wrapper, 'Afgevinkte wissen').attributes('disabled')).toBeDefined()
    await wrapper.find('.items input[type="checkbox"]').setValue(true)
    await buttonWithText(wrapper, 'Afgevinkte wissen').trigger('click')

    expect(confirm).not.toHaveBeenCalled()
    expect(wrapper.findAll('.items .line').map((l) => l.text())).toEqual(['zout'])
  })

  it('wist alles alleen na bevestiging in het venster', async () => {
    const wrapper = await mountApp(fillTwo)
    const dialog = () => wrapper.find('dialog')

    await buttonWithText(wrapper, 'Alles wissen').trigger('click')
    await flushPromises()
    expect(dialog().attributes('open')).toBeDefined()
    expect(dialog().find('h2').text()).toBe('De hele boodschappenlijst wissen?')

    await dialog().find('.cancel').trigger('click')
    await flushPromises()
    expect(dialog().attributes('open')).toBeUndefined()
    expect(wrapper.findAll('.items li')).toHaveLength(2)

    await buttonWithText(wrapper, 'Alles wissen').trigger('click')
    await flushPromises()
    await dialog().find('.confirm').trigger('click')
    await flushPromises()
    expect(wrapper.find('.empty').exists()).toBe(true)
  })

  it('toont de beheerlink in de voettekst en niet in het menu', async () => {
    const wrapper = await mountApp()

    expect(wrapper.find('footer a').attributes('href')).toBe('/beheer')
    expect(wrapper.find('nav').text()).not.toContain('Beheer')
  })
})
