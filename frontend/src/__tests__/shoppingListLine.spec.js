import { describe, it, expect } from 'vitest'
import { isStandardOnly, shoppingListLine, shoppingListSource } from '../utils/shoppingListLine'

const standard = (fields) => ({
  name: 'melk',
  quantity: null,
  unit: null,
  source_label: 'standaard',
  recipe_id: null,
  ...fields,
})
const recipe = (fields) => ({
  name: 'melk',
  quantity: 200,
  unit: 'ml',
  source_label: 'Pannenkoeken',
  recipe_id: 1,
  ...fields,
})

describe('shoppingListLine', () => {
  it('alleen standaardlijst: de naam bij 1, "×n" vanaf 2', () => {
    expect(shoppingListLine(standard({ standard_count: 1 }))).toBe('melk')
    expect(shoppingListLine(standard({ standard_count: 2 }))).toBe('melk ×2')
    expect(shoppingListLine(standard({ standard_count: 5 }))).toBe('melk ×5')
  })

  it('een oude regel zonder standard_count (offline kopie van vóór de teller) is gewoon de naam', () => {
    expect(shoppingListLine(standard({}))).toBe('melk')
  })

  it('een standaardregel met (toch) een hoeveelheid toont die', () => {
    expect(shoppingListLine(standard({ quantity: 500, unit: 'ml', standard_count: 1 }))).toBe(
      '500 ml melk',
    )
  })

  it('receptregel: hoeveelheid en naam, "+n" erachter als er van de standaardlijst bij is', () => {
    expect(shoppingListLine(recipe({ standard_count: 0 }))).toBe('200 ml melk')
    expect(shoppingListLine(recipe({ standard_count: 1 }))).toBe('200 ml melk +1')
    expect(shoppingListLine(recipe({ quantity: 0.5, unit: 'el', standard_count: 2 }))).toBe(
      '0,5 el melk +2',
    )
  })

  it('"naar smaak" uit een recept met standaarddeel: naam met "+n"', () => {
    expect(shoppingListLine(recipe({ quantity: null, unit: null, standard_count: 1 }))).toBe(
      'melk +1',
    )
  })
})

describe('shoppingListSource', () => {
  it('noemt de standaardlijst erbij als die heeft bijgeteld', () => {
    expect(shoppingListSource(recipe({ standard_count: 0 }))).toBe('Pannenkoeken')
    expect(shoppingListSource(recipe({ standard_count: 1 }))).toBe('Pannenkoeken, standaard')
    expect(shoppingListSource(standard({ standard_count: 3 }))).toBe('standaard')
    expect(shoppingListSource(recipe({ source_label: null, standard_count: 0 }))).toBeNull()
  })
})

describe('isStandardOnly', () => {
  it('alleen zonder recept en met herkomst "standaard"', () => {
    expect(isStandardOnly(standard({}))).toBe(true)
    expect(isStandardOnly(recipe({}))).toBe(false)
    expect(isStandardOnly(recipe({ recipe_id: null }))).toBe(false)
  })
})
