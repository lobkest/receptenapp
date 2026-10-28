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
  it('zonder hoeveelheid: alleen de naam; het aantal staat in de stepper, niet in de tekst', () => {
    expect(shoppingListLine(standard({ count: 1 }))).toBe('melk')
    expect(shoppingListLine(standard({ count: 2, standard_count: 2 }))).toBe('melk')
    expect(shoppingListLine(recipe({ quantity: null, unit: null, count: 3 }))).toBe('melk')
  })

  it('een oude regel zonder count (offline kopie van vóór het aantal) telt als 1', () => {
    expect(shoppingListLine(recipe({}))).toBe('200 ml melk')
  })

  it('met hoeveelheid: het aantal vermenigvuldigt, met "(×n)" erachter vanaf 2', () => {
    expect(shoppingListLine(recipe({ count: 1 }))).toBe('200 ml melk')
    expect(shoppingListLine(recipe({ count: 2 }))).toBe('400 ml melk (×2)')
    expect(shoppingListLine(recipe({ quantity: 0.5, unit: 'el', count: 3 }))).toBe(
      '1,5 el melk (×3)',
    )
  })

  it('een standaardregel met (toch) een hoeveelheid toont die', () => {
    expect(shoppingListLine(standard({ quantity: 500, unit: 'ml', count: 1 }))).toBe('500 ml melk')
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
