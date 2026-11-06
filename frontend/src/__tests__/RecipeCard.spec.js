import { describe, it, expect } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import RecipeCard from '../components/RecipeCard.vue'

function mountCard(recipe) {
  return mount(RecipeCard, {
    props: { recipe: { id: 7, title: 'Pannenkoeken', servings: 4, ...recipe } },
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
}

// Wat de kaart per tag zegt: bij een icoon de naam uit aria-label, anders de tekst.
function tagNames(wrapper) {
  return wrapper.findAll('.tag').map((tag) => {
    const icon = tag.find('[role="img"]')
    return icon.exists() ? icon.attributes('aria-label') : tag.text()
  })
}

describe('RecipeCard', () => {
  it('toont titel en tags, maar geen porties', () => {
    const wrapper = mountCard({ tags: ['vegetarisch'] })

    expect(wrapper.find('h3').text()).toBe('Pannenkoeken')
    expect(tagNames(wrapper)).toEqual(['vegetarisch'])
    // vegetarisch heeft een icoon: dan staat de naam niet als tekst op de kaart.
    expect(wrapper.text()).toBe('Pannenkoeken')
    expect(wrapper.text()).not.toContain('portie')
    expect(wrapper.text()).not.toContain('4')
  })

  it('rendert zonder image_url geen afbeeldingsvak en geen placeholder', () => {
    for (const image_url of [undefined, null, '']) {
      const wrapper = mountCard({ image_url })

      expect(wrapper.find('img').exists()).toBe(false)
      expect(wrapper.find('.media').exists()).toBe(false)
      expect(wrapper.find('svg').exists()).toBe(false)
      // De titel staat dan direct bovenaan de kaart.
      expect(wrapper.find('a').element.firstElementChild.classList.contains('body')).toBe(true)
    }
  })

  it('toont een decoratieve afbeelding (lege alt) als er een image_url is', () => {
    const wrapper = mountCard({ image_url: 'https://example.com/pannenkoek.jpg' })

    const img = wrapper.find('img')
    expect(img.attributes('src')).toBe('https://example.com/pannenkoek.jpg')
    expect(img.attributes('alt')).toBe('')
    expect(img.attributes('loading')).toBe('lazy')
    expect(wrapper.find('.media').exists()).toBe(true)
  })

  it('toont geen tags als er geen of lege tags zijn', () => {
    expect(mountCard().find('.tags').exists()).toBe(false)
    expect(mountCard({ tags: [] }).find('.tags').exists()).toBe(false)
  })

  it('toont maximaal zes tags plus "+n" voor de rest', () => {
    const wrapper = mountCard({
      tags: [
        'snel',
        { name: 'zoet' },
        'ontbijt',
        { name: 'hartig' },
        'oven',
        'winter',
        'feest',
        'bbq',
      ],
    })

    expect(tagNames(wrapper)).toEqual(['snel', 'zoet', 'ontbijt', 'hartig', 'oven', 'winter', '+2'])
  })

  it('vijf tags met de automatische eerst, waarvan één met hint, passen zonder "+n"', () => {
    const plain = (name) => ({ name, status: 'ja', disclaimer: false, swaps: [], without: [] })
    const wrapper = mountCard({
      tags: ['snel'],
      automatic_tags: [
        plain('glutenvrij'),
        plain('lactosevrij'),
        {
          ...plain('veganistisch'),
          status: 'met_wissel',
          swaps: [
            { recipe_ingredient_id: 1, ingredient: 'ei', alternatives: [{ id: 2, name: 'tofu' }] },
          ],
        },
        plain('vegetarisch'),
      ],
    })

    expect(tagNames(wrapper)).toEqual([
      'glutenvrij',
      'lactosevrij',
      'veganistisch, met wissel',
      'vegetarisch',
      'snel',
    ])
    expect(wrapper.findAll('.tag-hint')).toHaveLength(1)
    expect(wrapper.find('.tag-more').exists()).toBe(false)
  })

  it('toont eerst de automatische tags, met een korte hint als er een wissel nodig is', () => {
    const wrapper = mountCard({
      tags: ['snel'],
      automatic_tags: [
        { name: 'glutenvrij', status: 'ja', disclaimer: true, swaps: [], without: [] },
        {
          name: 'vegetarisch',
          status: 'met_wissel',
          disclaimer: false,
          swaps: [
            { recipe_ingredient_id: 1, ingredient: 'kip', alternatives: [{ id: 2, name: 'tofu' }] },
          ],
          without: [],
        },
      ],
    })

    expect(tagNames(wrapper)).toEqual(['glutenvrij', 'vegetarisch, met wissel', 'snel'])
    // De wissel: een stipje (klasse tag-hint), de uitleg alleen in de tooltip.
    const tags = wrapper.findAll('.tag')
    expect(tags[1].classes()).toContain('tag-hint')
    expect(tags[1].find('[role="img"]').attributes('title')).toBe(
      'vegetarisch: met tofu i.p.v. kip',
    )
    expect(tags[0].classes()).not.toContain('tag-hint')
    expect(wrapper.text()).not.toContain('tofu')
  })

  it('toont tags met een icoon als bolletje, vrije tags als tekst erachter', () => {
    const wrapper = mountCard({ tags: ['zomer', 'snel', 'Vis '] })

    const tags = wrapper.findAll('.tag')
    expect(tags.map((tag) => tag.classes('tag-icon'))).toEqual([true, true, false])
    expect(tags[0].find('[role="img"]').attributes('aria-label')).toBe('snel')
    expect(tags[0].find('svg').attributes('aria-hidden')).toBe('true')
    expect(tags[1].find('[role="img"]').attributes('title')).toBe('Vis ')
    expect(tags[2].text()).toBe('zomer')
  })

  it('linkt de hele kaart naar het recept', () => {
    const wrapper = mountCard()

    const links = wrapper.findAllComponents(RouterLinkStub)
    expect(links).toHaveLength(1)
    expect(links[0].props('to')).toBe('/recepten/7')
    expect(wrapper.find('button').exists()).toBe(false)
  })
})
