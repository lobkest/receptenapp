import { describe, it, expect } from 'vitest'
import {
  findIngredients,
  joinNames,
  matchHints,
  matchSwaps,
  parseIngredientIds,
} from '../utils/ingredientSearch'

const LIST = [
  { id: 1, name: 'rode ui' },
  { id: 2, name: 'ui' },
  { id: 3, name: 'uitjes' },
  { id: 4, name: 'bloem' },
]

describe('findIngredients', () => {
  it('elk woord moet in de naam staan; precies die naam bovenaan, dan op naam', () => {
    expect(findIngredients(LIST, ' UI ').map((i) => i.name)).toEqual(['ui', 'rode ui', 'uitjes'])
    expect(findIngredients(LIST, 'ui rode').map((i) => i.name)).toEqual(['rode ui'])
    expect(findIngredients(LIST, '   ')).toEqual([])
  })

  it('laat weg wat al gekozen is, en geeft er hoogstens max', () => {
    expect(findIngredients(LIST, 'ui', { exclude: new Set([2]), max: 1 })).toEqual([LIST[0]])
  })
})

describe('parseIngredientIds', () => {
  it("leest id's uit de URL, zonder onzin en dubbele", () => {
    expect(parseIngredientIds('12, 34,abc,,12,-1')).toEqual([12, 34])
    expect(parseIngredientIds(['1', '2,3'])).toEqual([1, 2, 3])
    expect(parseIngredientIds(undefined)).toEqual([])
  })
})

describe('matchHints en matchSwaps', () => {
  const swap = {
    recipe_ingredient_id: 5,
    alternative_id: 9,
    ingredient: 'aubergine',
    alternative: 'courgette',
  }
  const result = {
    matches: [
      { ingredient_id: 1, name: 'ui', via: 'original', swap: null },
      { ingredient_id: 2, name: 'courgette', via: 'alternative', swap },
      { ingredient_id: 3, name: 'peterselie', via: 'optional', swap: null },
      {
        ingredient_id: 4,
        name: 'bieslook',
        via: 'optional',
        swap: {
          recipe_ingredient_id: 6,
          alternative_id: 10,
          ingredient: 'peterselie',
          alternative: 'bieslook',
        },
      },
    ],
  }

  it('geeft een hint voor een alternatief en voor optioneel, niet voor een origineel', () => {
    expect(matchHints(result)).toEqual([
      'met courgette i.p.v. aubergine',
      'peterselie optioneel',
      'bieslook optioneel',
    ])
    expect(matchHints(null)).toEqual([])
  })

  it('zet elke wissel in de vorm van ?wissel=', () => {
    expect(matchSwaps(result)).toBe('5:9,6:10')
    expect(matchSwaps({ matches: [result.matches[0]] })).toBeUndefined()
  })
})

describe('joinNames', () => {
  it('"of" voor de laatste', () => {
    expect(joinNames([])).toBe('')
    expect(joinNames(['ui'])).toBe('ui')
    expect(joinNames(['ui', 'prei'])).toBe('ui of prei')
    expect(joinNames(['ui', 'prei', 'kool'])).toBe('ui, prei of kool')
  })
})
