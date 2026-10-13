import { describe, it, expect } from 'vitest'
import { byName, groupByCategory } from '../utils/grouping'

const CATEGORIES = { melk: 'zuivel', kaas: 'zuivel', appels: 'groente & fruit' }
const categoryOf = (item) => CATEGORIES[item.name]

function names(groups) {
  return groups.map((g) => [g.category, g.items.map((i) => i.name)])
}

describe('groupByCategory', () => {
  it('groepeert op alfabet, onbekend als laatste onder null', () => {
    const items = [{ name: 'kaas' }, { name: 'kaars' }, { name: 'appels' }, { name: 'melk' }]

    expect(names(groupByCategory(items, categoryOf))).toEqual([
      ['groente & fruit', ['appels']],
      ['zuivel', ['kaas', 'melk']],
      [null, ['kaars']],
    ])
  })

  it('houdt binnen een groep de volgorde van de invoer', () => {
    const items = [{ name: 'melk' }, { name: 'kaas' }]

    expect(names(groupByCategory(items, categoryOf))).toEqual([['zuivel', ['melk', 'kaas']]])
    expect(names(groupByCategory(items.toSorted(byName), categoryOf))).toEqual([
      ['zuivel', ['kaas', 'melk']],
    ])
  })

  it('geeft een lege lijst voor geen items', () => {
    expect(groupByCategory([], categoryOf)).toEqual([])
  })
})
