import { describe, it, expect } from 'vitest'
import { MAX_CARD_TAGS, sortByCardHeight, visibleTagChipCount } from '../utils/sortRecipes'

function recipe(title, tagCount, automaticCount = 0) {
  return {
    title,
    tags: Array.from({ length: tagCount }, (_, i) => `tag${i}`),
    automatic_tags: Array.from({ length: automaticCount }, (_, i) => ({ name: `auto${i}` })),
  }
}

const titles = (recipes) => recipes.map((r) => r.title)

describe('visibleTagChipCount', () => {
  it('telt de chips zoals de kaart ze toont', () => {
    expect(visibleTagChipCount(recipe('a', 0))).toBe(0)
    expect(visibleTagChipCount(recipe('a', 1))).toBe(1)
    expect(visibleTagChipCount(recipe('a', 3))).toBe(3)
    expect(visibleTagChipCount(recipe('a', MAX_CARD_TAGS))).toBe(MAX_CARD_TAGS)
  })

  it('telt de "+N"-chip als één chip', () => {
    expect(visibleTagChipCount(recipe('a', MAX_CARD_TAGS + 1))).toBe(MAX_CARD_TAGS + 1)
    expect(visibleTagChipCount(recipe('a', MAX_CARD_TAGS + 4))).toBe(MAX_CARD_TAGS + 1)
  })

  it('telt automatische tags mee', () => {
    expect(visibleTagChipCount(recipe('a', 1, 2))).toBe(3)
    expect(visibleTagChipCount(recipe('a', 4, 3))).toBe(MAX_CARD_TAGS + 1)
  })

  it('kan zonder tags-velden', () => {
    expect(visibleTagChipCount({ title: 'a' })).toBe(0)
  })
})

describe('sortByCardHeight', () => {
  it('zet 0, 1, 3 en 5 tags van weinig naar veel', () => {
    const recipes = [recipe('Vijf', 5), recipe('Nul', 0), recipe('Drie', 3), recipe('Een', 1)]

    expect(titles(sortByCardHeight(recipes))).toEqual(['Nul', 'Een', 'Drie', 'Vijf'])
  })

  it('zet evenveel tags op titel, in Nederlandse volgorde', () => {
    const recipes = [
      recipe('Zuurkool', 2),
      recipe('ééntopf', 2),
      recipe('Appeltaart', 2),
      recipe('erwtensoep', 2),
      recipe('Boerenkool', 1),
    ]

    expect(titles(sortByCardHeight(recipes))).toEqual([
      'Boerenkool',
      'Appeltaart',
      'ééntopf',
      'erwtensoep',
      'Zuurkool',
    ])
  })

  it('zet meer dan vijf tags (met "+N") achteraan, die tellen gelijk', () => {
    const recipes = [recipe('Bami', 8), recipe('Andijvie', 6), recipe('Couscous', 5)]

    expect(titles(sortByCardHeight(recipes))).toEqual(['Couscous', 'Andijvie', 'Bami'])
  })

  it('verandert de invoer niet', () => {
    const recipes = [recipe('B', 3), recipe('A', 0)]
    const before = structuredClone(recipes)

    const sorted = sortByCardHeight(recipes)

    expect(recipes).toEqual(before)
    expect(sorted).not.toBe(recipes)
    expect(titles(sorted)).toEqual(['A', 'B'])
  })
})
