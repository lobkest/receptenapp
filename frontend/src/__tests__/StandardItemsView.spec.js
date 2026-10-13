import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import App from '../App.vue'
import { routes } from '../router'
import { EXAMPLE_ITEMS, useStandardItemsStore } from '../stores/standardItems'
import { useShoppingListStore } from '../stores/shoppingList'

// Monteert de hele App, zodat we ook de link in het menu kunnen testen.
async function mountApp(fill = () => {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  fill(useStandardItemsStore())
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push('/standaard')
  const wrapper = mount(App, { global: { plugins: [pinia, router] }, attachTo: document.body })
  await flushPromises()
  return wrapper
}

function fillThree(standard) {
  standard.add({ name: 'melk', quantity: 1000, unit: 'ml', category: 'zuivel' })
  standard.add({ name: 'kaas', quantity: 400, unit: 'g', category: 'zuivel' })
  standard.add({ name: 'wc-papier' })
}

function buttonWithText(wrapper, text) {
  return wrapper.findAll('button').find((b) => b.text() === text)
}

function lines(wrapper) {
  return wrapper.findAll('.items .line').map((l) => l.text())
}

// Het li-element van een item, gevonden op de getoonde tekst.
function rowOf(wrapper, line) {
  return wrapper.findAll('.items li').find((li) => li.find('.line').text() === line)
}

function shoppingLines() {
  return useShoppingListStore().items.map((i) => [i.name, i.quantity, i.unit])
}

describe('StandardItemsView', () => {
  let wrapper

  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    wrapper?.unmount()
    vi.useRealTimers()
  })

  it('staat in het hoofdmenu', async () => {
    wrapper = await mountApp()

    const link = wrapper.findAll('nav a').find((a) => a.text() === 'Standaard')
    expect(link.attributes('href')).toBe('/standaard')
  })

  it('begint leeg en laadt de voorbeeldlijst', async () => {
    wrapper = await mountApp()
    expect(wrapper.find('.empty').text()).toContain('nog geen')

    await wrapper.find('.load-example').trigger('click')

    expect(wrapper.find('.empty').exists()).toBe(false)
    expect(lines(wrapper)).toHaveLength(EXAMPLE_ITEMS.length)
  })

  it('toont items per categorie, zonder categorie onder "overig"', async () => {
    wrapper = await mountApp(fillThree)

    expect(wrapper.findAll('.group h2').map((h) => h.text())).toEqual(['zuivel', 'overig'])
    expect(lines(wrapper)).toEqual(['400 g kaas', '1.000 ml melk', 'wc-papier'])
  })

  it('voegt een item toe via het formulier en maakt het formulier leeg', async () => {
    wrapper = await mountApp()
    const form = wrapper.find('.add-card form')

    await form.find('.name').setValue('Yoghurt')
    await form.find('.quantity').setValue('500')
    await form.find('.unit').setValue('ml')
    await form.find('.category').setValue('zuivel')
    await form.trigger('submit')

    expect(lines(wrapper)).toEqual(['500 ml yoghurt'])
    expect(wrapper.find('.add-card .name').element.value).toBe('')
    expect(JSON.parse(localStorage.getItem('standardItems')).items).toHaveLength(1)
  })

  it('meldt een ontbrekende naam en een ongeldige hoeveelheid', async () => {
    wrapper = await mountApp()
    const form = wrapper.find('.add-card form')

    await form.find('.quantity').setValue('0')
    await form.trigger('submit')

    expect(form.findAll('.error').map((e) => e.text())).toEqual([
      'Vul een naam in.',
      'Vul een hoeveelheid groter dan 0 in, of laat het leeg.',
    ])
    expect(form.find('.name').attributes('aria-invalid')).toBe('true')
    expect(useStandardItemsStore().items).toEqual([])
  })

  it('bewerkt een item op zijn plek, en annuleren laat het ongemoeid', async () => {
    wrapper = await mountApp(fillThree)

    await rowOf(wrapper, 'wc-papier').find('.edit').trigger('click')
    let editForm = wrapper.find('.items form')
    expect(editForm.find('.name').element.value).toBe('wc-papier')
    await buttonWithText(wrapper, 'Annuleren').trigger('click')
    expect(wrapper.find('.items form').exists()).toBe(false)

    await rowOf(wrapper, 'wc-papier').find('.edit').trigger('click')
    editForm = wrapper.find('.items form')
    await editForm.find('.quantity').setValue('8')
    await editForm.find('.unit').setValue('stuks')
    await editForm.find('.category').setValue('huishouden')
    await editForm.trigger('submit')

    expect(wrapper.find('.items form').exists()).toBe(false)
    expect(wrapper.findAll('.group h2').map((h) => h.text())).toEqual(['huishouden', 'zuivel'])
    expect(lines(wrapper)).toContain('8 stuks wc-papier')
  })

  it('verwijdert een item', async () => {
    wrapper = await mountApp(fillThree)

    await rowOf(wrapper, '400 g kaas').find('.remove').trigger('click')

    expect(lines(wrapper)).toEqual(['1.000 ml melk', 'wc-papier'])
  })

  it('zet één item op de boodschappenlijst, met bevestiging die weer verdwijnt', async () => {
    vi.useFakeTimers()
    wrapper = await mountApp(fillThree)

    await rowOf(wrapper, '1.000 ml melk').find('.add-one').trigger('click')

    expect(shoppingLines()).toEqual([['melk', 1000, 'ml']])
    expect(useShoppingListStore().items[0].sources[0].title).toBe('standaard')
    expect(wrapper.find('[role="status"]').text()).toContain('melk staat op je boodschappenlijst')

    await vi.advanceTimersByTimeAsync(3000)
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })

  it('zet geselecteerde items op de lijst en wist daarna de selectie', async () => {
    wrapper = await mountApp(fillThree)
    const addSelected = wrapper.find('.add-selected')
    expect(addSelected.attributes('disabled')).toBeDefined()

    await rowOf(wrapper, '400 g kaas').find('input[type="checkbox"]').setValue(true)
    await rowOf(wrapper, 'wc-papier').find('input[type="checkbox"]').setValue(true)
    expect(addSelected.text()).toBe('Geselecteerde op lijst (2)')

    await addSelected.trigger('click')

    expect(shoppingLines()).toEqual([
      ['kaas', 400, 'g'],
      ['wc-papier', null, null],
    ])
    expect(wrapper.find('[role="status"]').text()).toContain('2 items staan')
    expect(wrapper.findAll('.items input:checked')).toHaveLength(0)
    expect(addSelected.attributes('disabled')).toBeDefined()
  })

  it('selecteert alles en wist de selectie weer', async () => {
    wrapper = await mountApp(fillThree)

    await buttonWithText(wrapper, 'Alles selecteren').trigger('click')
    expect(wrapper.findAll('.items input:checked')).toHaveLength(3)

    await buttonWithText(wrapper, 'Selectie wissen').trigger('click')
    expect(wrapper.findAll('.items input:checked')).toHaveLength(0)
  })

  it('haalt een verwijderd item ook uit de selectie', async () => {
    wrapper = await mountApp(fillThree)

    await rowOf(wrapper, 'wc-papier').find('input[type="checkbox"]').setValue(true)
    await rowOf(wrapper, 'wc-papier').find('.remove').trigger('click')

    expect(wrapper.find('.add-selected').attributes('disabled')).toBeDefined()
  })
})
