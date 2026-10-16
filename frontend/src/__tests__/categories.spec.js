import { describe, it, expect } from 'vitest'
import { categoryChips, NO_CATEGORY, orderedCategories, recipeSections } from '../utils/categories'

const BREAKFAST = { id: 1, name: 'Ontbijt', position: 1 }
const LUNCH = { id: 2, name: 'Lunch', position: 2 }
const DINNER = { id: 3, name: 'Diner', position: 3 }
const CATEGORIES = [DINNER, BREAKFAST, LUNCH] // bewust niet op volgorde

const RECIPES = [
  { id: 1, title: 'Pannenkoeken', tags: ['vega', 'zoet'], category: BREAKFAST },
  { id: 2, title: 'Stamppot', tags: [], category: null },
  { id: 3, title: 'Curry', tags: ['vega', 'pittig'], category: DINNER },
  { id: 4, title: 'Havermout', tags: ['vega'], category: BREAKFAST },
  { id: 5, title: 'Soep van oma', tags: ['vega'], category: null },
]

// [['Ontbijt', ['Pannenkoeken', 'Havermout']], ...]: kort en leesbaar in een verwachting.
function summary(sections) {
  return sections.map((section) => [section.name, section.recipes.map((r) => r.title)])
}

describe('recipeSections', () => {
  it('groepeert per categorie op position, met "Overig" onderaan', () => {
    expect(summary(recipeSections(RECIPES, CATEGORIES))).toEqual([
      ['Ontbijt', ['Pannenkoeken', 'Havermout']],
      ['Diner', ['Curry']],
      ['Overig', ['Stamppot', 'Soep van oma']],
    ])
  })

  it('laat lege secties weg: Lunch heeft geen recepten, en zonder recepten zonder categorie geen Overig', () => {
    const sections = recipeSections(
      RECIPES.filter((r) => r.category),
      CATEGORIES,
    )
    expect(sections.map((s) => s.name)).toEqual(['Ontbijt', 'Diner'])
  })

  it('toont bij een gekozen categorie alleen die sectie', () => {
    expect(summary(recipeSections(RECIPES, CATEGORIES, { selected: '3' }))).toEqual([
      ['Diner', ['Curry']],
    ])
    expect(summary(recipeSections(RECIPES, CATEGORIES, { selected: NO_CATEGORY }))).toEqual([
      ['Overig', ['Stamppot', 'Soep van oma']],
    ])
    expect(recipeSections(RECIPES, CATEGORIES, { selected: '2' })).toEqual([])
  })

  it('combineert de categorie met alle gekozen tags', () => {
    expect(
      summary(recipeSections(RECIPES, CATEGORIES, { selected: '1', tags: ['vega', 'zoet'] })),
    ).toEqual([['Ontbijt', ['Pannenkoeken']]])
    expect(recipeSections(RECIPES, CATEGORIES, { selected: '3', tags: ['zoet'] })).toEqual([])
  })

  it('laat ook bij "Alles" secties weg die na het tagfilter leeg zijn', () => {
    expect(summary(recipeSections(RECIPES, CATEGORIES, { tags: ['vega'] }))).toEqual([
      ['Ontbijt', ['Pannenkoeken', 'Havermout']],
      ['Diner', ['Curry']],
      ['Overig', ['Soep van oma']],
    ])
    expect(summary(recipeSections(RECIPES, CATEGORIES, { tags: ['pittig'] }))).toEqual([
      ['Diner', ['Curry']],
    ])
  })

  it('kent ook een categorie die (nog) niet in /api/categories staat', () => {
    const brunch = { id: 9, name: 'Brunch', position: 5 }
    const recipes = [...RECIPES, { id: 6, title: 'Eggs', tags: [], category: brunch }]

    expect(recipeSections(recipes, []).map((s) => s.name)).toEqual([
      'Ontbijt',
      'Diner',
      'Brunch',
      'Overig',
    ])
  })
})

describe('orderedCategories', () => {
  it('sorteert op position, bij gelijke position op id', () => {
    const later = { id: 7, name: 'Toetjes', position: 1 }
    expect(orderedCategories([later, ...CATEGORIES]).map((c) => c.name)).toEqual([
      'Ontbijt',
      'Toetjes',
      'Lunch',
      'Diner',
    ])
  })
})

describe('categoryChips', () => {
  it('heeft "Alles", elke categorie (ook zonder recepten) en "Overig" als er recepten zonder categorie zijn', () => {
    expect(categoryChips(CATEGORIES, RECIPES)).toEqual([
      { key: null, name: 'Alles' },
      { key: '1', name: 'Ontbijt' },
      { key: '2', name: 'Lunch' },
      { key: '3', name: 'Diner' },
      { key: NO_CATEGORY, name: 'Overig' },
    ])
  })

  it('zonder recepten zonder categorie geen "Overig", behalve als die gekozen is', () => {
    const withCategory = RECIPES.filter((r) => r.category)
    expect(categoryChips(CATEGORIES, withCategory).map((c) => c.name)).not.toContain('Overig')
    expect(categoryChips(CATEGORIES, withCategory, NO_CATEGORY).at(-1).name).toBe('Overig')
  })
})
