import { describe, it, expect } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import RecipeCard from '../components/RecipeCard.vue'

function mountCard(recipe) {
  return mount(RecipeCard, {
    props: { recipe: { id: 7, title: 'Pannenkoeken', servings: 4, ...recipe } },
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
}

describe('RecipeCard', () => {
  it('toont titel en porties', () => {
    const wrapper = mountCard()

    expect(wrapper.find('h2').text()).toBe('Pannenkoeken')
    expect(wrapper.text()).toContain('4 porties')
  })

  it('zegt "portie" bij één portie', () => {
    const wrapper = mountCard({ servings: 1 })

    expect(wrapper.text()).toContain('1 portie')
    expect(wrapper.text()).not.toContain('porties')
  })

  it('toont een placeholder zonder image_url', () => {
    const wrapper = mountCard()

    const placeholder = wrapper.find('[data-test="placeholder"]')
    expect(placeholder.exists()).toBe(true)
    expect(placeholder.attributes('aria-hidden')).toBe('true')
    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('toont een decoratieve afbeelding (lege alt) als er een image_url is', () => {
    const wrapper = mountCard({ image_url: 'https://example.com/pannenkoek.jpg' })

    const img = wrapper.find('img')
    expect(img.attributes('src')).toBe('https://example.com/pannenkoek.jpg')
    expect(img.attributes('alt')).toBe('')
    expect(img.attributes('loading')).toBe('lazy')
    expect(wrapper.find('[data-test="placeholder"]').exists()).toBe(false)
  })

  it('toont geen tags als er geen of lege tags zijn', () => {
    expect(mountCard().find('.tags').exists()).toBe(false)
    expect(mountCard({ tags: [] }).find('.tags').exists()).toBe(false)
  })

  it('toont maximaal twee tags plus "+n" voor de rest', () => {
    const wrapper = mountCard({
      tags: ['vegetarisch', { name: 'snel' }, 'zoet', { name: 'ontbijt' }],
    })

    const tags = wrapper.findAll('.tag').map((tag) => tag.text())
    expect(tags).toEqual(['vegetarisch', 'snel', '+2'])
  })

  it('linkt de hele kaart naar het recept', () => {
    const wrapper = mountCard()

    const links = wrapper.findAllComponents(RouterLinkStub)
    expect(links).toHaveLength(1)
    expect(links[0].props('to')).toBe('/recepten/7')
    expect(wrapper.find('button').exists()).toBe(false)
  })
})
