import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import VariationCard from '../components/VariationCard.vue'

const VARIATION = {
  id: 7,
  name: 'Met kip',
  notes: 'Kip eerst bakken.',
  changes: [
    { id: 1, kind: 'remove', recipe_ingredient_id: 21, name: 'tofu', quantity: null, unit: null },
    { id: 2, kind: 'add', recipe_ingredient_id: null, name: 'kip', quantity: 150, unit: 'g' },
    { id: 3, kind: 'add', recipe_ingredient_id: null, name: 'peper', quantity: null, unit: null },
  ],
  tag_changes: [
    { kind: 'add', tag: 'vlees' },
    { kind: 'remove', tag: 'vega' },
  ],
}

function mountCard(props = {}) {
  return mount(VariationCard, { props: { variation: VARIATION, ...props } })
}

describe('VariationCard', () => {
  it('toont wat eraf gaat rood en doorgestreept met "−", wat erbij komt groen met "+"', () => {
    const wrapper = mountCard()

    const removed = wrapper.find('.change.removed')
    expect(removed.text()).toBe('− tofu')
    expect(removed.find('s').text()).toBe('tofu')
    expect(wrapper.findAll('.change.added').map((c) => c.text())).toEqual([
      '+ 150 g kip',
      '+ peper (naar smaak)',
    ])
  })

  it('toont tags erbij en eraf met een teken én een kleur, en de notities', () => {
    const wrapper = mountCard()

    const tags = wrapper.findAll('.tag-change')
    expect(tags.map((t) => [t.text(), t.classes()])).toEqual([
      ['+ vlees', ['tag-change', 'added']],
      ['− vega', ['tag-change', 'removed']],
    ])
    expect(tags[1].attributes('title')).toBe('tag vega eraf')
    expect(wrapper.find('.notes').text()).toBe('Kip eerst bakken.')
  })

  it('schaalt de extra hoeveelheden mee met de porties', () => {
    const wrapper = mountCard({ factor: 1.5 })

    expect(wrapper.findAll('.change.added').map((c) => c.text())).toEqual([
      '+ 225 g kip',
      '+ peper (naar smaak)',
    ])
  })

  it('heeft de knoppen Variatie op lijst, Bewerken en Verwijderen', async () => {
    const wrapper = mountCard()

    const buttons = wrapper.findAll('button')
    expect(buttons.map((b) => b.text())).toEqual(['Variatie op lijst', 'Bewerken', 'Verwijderen'])
    for (const button of buttons) await button.trigger('click')
    expect(wrapper.emitted('add-to-list')[0]).toEqual([VARIATION])
    expect(wrapper.emitted('edit')[0]).toEqual([VARIATION])
    expect(wrapper.emitted('delete')[0]).toEqual([VARIATION])
  })

  it('schakelt de knoppen uit zolang er een actie loopt', () => {
    const wrapper = mountCard({ busy: true })

    expect(wrapper.findAll('button').every((b) => b.attributes('disabled') !== undefined)).toBe(
      true,
    )
  })
})
