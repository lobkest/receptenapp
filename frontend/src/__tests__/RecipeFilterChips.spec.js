import { describe, it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import RecipeFilterChips from '@/components/RecipeFilterChips.vue'

const CATEGORIES = [
  { id: 1, name: 'Ontbijt', position: 1 },
  { id: 3, name: 'Diner', position: 3 },
]
const TAGS = [
  { name: 'snel', count: 2 },
  { name: 'vegetarisch', count: 1, automatic: true },
]

async function mountAt(path, props = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:any(.*)', component: { template: '<div />' } }],
  })
  await router.push(path)
  const wrapper = mount(RecipeFilterChips, {
    props: { categories: CATEGORIES, recipes: [{ category: null }], tags: TAGS, ...props },
    global: { plugins: [router] },
  })
  await flushPromises()
  return { wrapper, router }
}

const texts = (wrapper, selector) => wrapper.findAll(selector).map((chip) => chip.text())
const pressed = (wrapper, selector) =>
  wrapper.findAll(selector).map((chip) => chip.attributes('aria-pressed'))

describe('RecipeFilterChips', () => {
  it('toont categorieën met "Alles" en "Overig", en tags met hun aantal', async () => {
    const { wrapper } = await mountAt('/')

    expect(texts(wrapper, '.category-chips .filter-chip')).toEqual([
      'Alles',
      'Ontbijt',
      'Diner',
      'Overig',
    ])
    expect(texts(wrapper, '.tag-chips .filter-chip')).toEqual(['snel 2', 'vegetarisch 1'])
    expect(wrapper.find('.clear-filters').exists()).toBe(false)
  })

  it('zet een categorie en tags in de URL, op elke pagina (ook /in-huis)', async () => {
    const { wrapper, router } = await mountAt('/in-huis')

    await wrapper.findAll('.category-chips .filter-chip')[2].trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ category: '3' })

    await wrapper.findAll('.tag-chips .filter-chip')[1].trigger('click')
    await flushPromises()
    await wrapper.findAll('.tag-chips .filter-chip')[0].trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/in-huis')
    expect(router.currentRoute.value.query).toEqual({ category: '3', tags: 'vegetarisch,snel' })
    expect(pressed(wrapper, '.tag-chips .filter-chip')).toEqual(['true', 'true'])
    expect(pressed(wrapper, '.category-chips .filter-chip')).toEqual([
      'false',
      'false',
      'true',
      'false',
    ])
  })

  it('een tag uit een oude link staat erbij om uit te zetten; "Wis filters" wist alles', async () => {
    const { wrapper, router } = await mountAt('/in-huis?tags=vega&category=overig&zoek=x')

    expect(texts(wrapper, '.tag-chips .filter-chip')).toEqual(['snel 2', 'vegetarisch 1', 'vega'])
    await wrapper.find('.clear-filters').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ zoek: 'x' })
  })

  it('zonder recepten zonder categorie geen "Overig"; zonder tags geen tagrij', async () => {
    const { wrapper } = await mountAt('/', { recipes: [], tags: [] })

    expect(texts(wrapper, '.category-chips .filter-chip')).toEqual(['Alles', 'Ontbijt', 'Diner'])
    expect(wrapper.find('.tag-chips').exists()).toBe(false)
  })
})
