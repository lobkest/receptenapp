import { describe, it, expect } from 'vitest'
import {
  LOOSE_TITLE,
  groupByRecipe,
  recipeKeyOf,
  recipesOnList,
  removeRecipeQuestion,
} from '../utils/shoppingListRecipes'

function line(id, fields = {}) {
  return {
    id,
    name: `item${id}`,
    recipe_id: null,
    source_label: null,
    checked: false,
    standard_count: 0,
    ...fields,
  }
}

const orzo = { recipe_id: 1, recipe_title: 'Pien orzo', source_label: 'Pien orzo' }
const wok = { recipe_id: 2, recipe_title: 'Wok met kip', source_label: 'Wok met kip' }
const standard = { source_label: 'standaard', standard_count: 1 }

describe('recipeKeyOf', () => {
  it('kent een recept, een verwijderd recept, en losse regels', () => {
    expect(recipeKeyOf(line(1, orzo))).toBe('recept-1')
    expect(recipeKeyOf(line(2, { source_label: 'Oude soep' }))).toBe('label-Oude soep')
    expect(recipeKeyOf(line(3, standard))).toBeNull()
    expect(recipeKeyOf(line(4))).toBeNull()
  })

  it('een variatie hoort bij het recept', () => {
    expect(recipeKeyOf(line(1, { ...orzo, source_label: 'Pien orzo (variatie: vega)' }))).toBe(
      'recept-1',
    )
  })
})

describe('recipesOnList', () => {
  it('telt per recept de open regels, nieuwste recept bovenaan', () => {
    const items = [
      line(1, orzo),
      line(2, wok),
      line(3, orzo),
      line(4, standard),
      line(5, { ...orzo, checked: true }),
      line(6, wok),
    ]

    expect(recipesOnList(items).map((r) => [r.title, r.openCount, r.recipeId])).toEqual([
      ['Wok met kip', 2, 2],
      ['Pien orzo', 2, 1],
    ])
  })

  it('volgorde op de laatst toegevoegde OPEN regel', () => {
    const items = [line(1, wok), line(2, orzo), line(3, { ...wok, checked: true })]

    expect(recipesOnList(items).map((r) => r.title)).toEqual(['Pien orzo', 'Wok met kip'])
  })

  it('een recept met alleen afgevinkte regels staat er niet in; geen recepten geeft []', () => {
    expect(recipesOnList([line(1, { ...orzo, checked: true }), line(2, standard)])).toEqual([])
    expect(recipesOnList([])).toEqual([])
  })

  it('telt regels die ook van de standaardlijst kwamen apart (die blijven staan)', () => {
    const [recipe] = recipesOnList([line(1, { ...orzo, standard_count: 1 }), line(2, orzo)])

    expect(recipe).toMatchObject({ openCount: 2, keptCount: 1 })
  })

  it('verborgen of verwijderd recept: geen link, wel te verwijderen', () => {
    const items = [
      line(1, { ...wok, recipe_visible: false }),
      line(2, { source_label: 'Oude soep' }),
      line(3, { ...orzo, recipe_visible: true }),
    ]

    expect(
      recipesOnList(items).map((r) => [r.title, r.linkable, r.recipeId, r.sourceLabel]),
    ).toEqual([
      ['Pien orzo', true, 1, null],
      ['Oude soep', false, null, 'Oude soep'],
      ['Wok met kip', false, 2, null],
    ])
  })

  it('een oude opgeslagen kopie zonder recipe_title gebruikt de herkomst', () => {
    const [recipe] = recipesOnList([line(1, { recipe_id: 1, source_label: 'Pien orzo' })])

    expect(recipe).toMatchObject({ title: 'Pien orzo', linkable: true })
  })
})

describe('groupByRecipe', () => {
  it('een sectie per recept, daarna "Los / standaardlijst", met de gewone volgorde erbinnen', () => {
    const items = [
      line(1, orzo),
      line(2, standard),
      line(3, wok),
      line(4, { ...orzo, checked: true }),
      line(5),
      line(6, orzo),
    ]

    expect(groupByRecipe(items).map((s) => [s.title, s.items.map((i) => i.id)])).toEqual([
      ['Pien orzo', [1, 4, 6]],
      ['Wok met kip', [3]],
      [LOOSE_TITLE, [2, 5]],
    ])
  })

  it('een receptregel met +1 van de standaardlijst staat bij het recept', () => {
    const items = [line(1, { ...orzo, standard_count: 1 }), line(2, standard)]

    expect(groupByRecipe(items).map((s) => [s.title, s.items.map((i) => i.id)])).toEqual([
      ['Pien orzo', [1]],
      [LOOSE_TITLE, [2]],
    ])
  })

  it('zonder losse regels geen lege sectie; zonder recepten alleen "Los"', () => {
    expect(groupByRecipe([line(1, orzo)]).map((s) => s.title)).toEqual(['Pien orzo'])
    expect(groupByRecipe([line(1, standard)]).map((s) => s.title)).toEqual([LOOSE_TITLE])
  })

  it('variaties van hetzelfde recept in één sectie', () => {
    const items = [line(1, orzo), line(2, { ...orzo, source_label: 'Pien orzo (variatie: vega)' })]

    expect(groupByRecipe(items)).toHaveLength(1)
  })
})

describe('removeRecipeQuestion', () => {
  it('noemt het aantal en de naam', () => {
    expect(removeRecipeQuestion({ title: 'pien orzo', openCount: 5, keptCount: 0 })).toEqual({
      title: "5 items van 'pien orzo' van de lijst halen?",
      text: 'Afgevinkte regels blijven staan.',
    })
    expect(removeRecipeQuestion({ title: 'wok', openCount: 1, keptCount: 0 }).title).toBe(
      "1 item van 'wok' van de lijst halen?",
    )
  })

  it('zegt wat blijft staan door de standaardlijst', () => {
    expect(removeRecipeQuestion({ title: 'pien orzo', openCount: 5, keptCount: 1 })).toEqual({
      title: "4 items van 'pien orzo' van de lijst halen?",
      text: '1 item blijft staan omdat het ook via de standaardlijst is toegevoegd. Afgevinkte regels blijven staan.',
    })
    expect(removeRecipeQuestion({ title: 'x', openCount: 3, keptCount: 2 }).text).toContain(
      '2 items blijven staan omdat ze ook via de standaardlijst zijn toegevoegd.',
    )
    expect(removeRecipeQuestion({ title: 'x', openCount: 1, keptCount: 1 }).title).toBe(
      "'x' van de lijst halen?",
    )
  })
})
