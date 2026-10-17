import { describe, it, expect } from 'vitest'
import {
  alternativeHint,
  houseStatus,
  ingredientIdsByName,
  presentIngredientIds,
  skippedMessage,
  splitInHouse,
} from '../utils/inHouse'
import { applySwaps } from '../utils/alternatives'

const PANTRY = {
  in_house: [{ id: 2, name: 'rijst' }],
  staples: [
    { id: 3, name: 'zout', present: true },
    { id: 6, name: 'peper', present: false },
  ],
  suggestions: [],
}

const INGREDIENTS = [
  { id: 1, name: 'kip' },
  { id: 2, name: 'rijst' },
  { id: 3, name: 'zout' },
  { id: 6, name: 'peper' },
  { id: 7, name: 'Feta' },
]

const lookup = {
  presentIds: presentIngredientIds(PANTRY),
  idByName: ingredientIdsByName(INGREDIENTS),
}
const statusOf = (ingredient) => houseStatus(ingredient, lookup)

describe('presentIngredientIds', () => {
  it('extra in huis plus de basis die niet op is', () => {
    expect([...presentIngredientIds(PANTRY)].sort()).toEqual([2, 3])
  })

  it('null zolang de voorraad niet geladen is', () => {
    expect(presentIngredientIds(null)).toBeNull()
  })
})

describe('houseStatus', () => {
  it('matcht op ingredient_id', () => {
    expect(statusOf({ ingredient_id: 2, name: 'iets anders' })).toEqual({
      ingredientId: 2,
      inHouse: true,
    })
    expect(statusOf({ ingredient_id: 1, name: 'kip' })).toEqual({
      ingredientId: 1,
      inHouse: false,
    })
  })

  it('zonder ingredient_id op naam: spaties eromheen weg, kleine letters, verder exact', () => {
    expect(statusOf({ name: '  RIJST ' })).toEqual({ ingredientId: 2, inHouse: true })
    expect(statusOf({ name: 'feta' })).toEqual({ ingredientId: 7, inHouse: false })
    expect(statusOf({ name: 'rijstnoedels' })).toBeNull()
  })

  it('basisvoorraad is in huis, tenzij hij op is', () => {
    expect(statusOf({ ingredient_id: 3, name: 'zout' }).inHouse).toBe(true)
    expect(statusOf({ name: 'peper' })).toEqual({ ingredientId: 6, inHouse: false })
  })

  it('zonder voorraad (nog niet geladen) geen huisje', () => {
    expect(houseStatus({ ingredient_id: 2 }, { presentIds: null, idByName: new Map() })).toBeNull()
  })
})

describe('splitInHouse en skippedMessage', () => {
  it('scheidt wat in huis is; onbekend telt als niet in huis', () => {
    const items = [{ name: 'kip' }, { name: 'rijst' }, { name: 'onbekend' }, { name: 'zout' }]

    const { toAdd, inHouse } = splitInHouse(items, statusOf)

    expect(toAdd.map((i) => i.name)).toEqual(['kip', 'onbekend'])
    expect(inHouse.map((i) => i.name)).toEqual(['rijst', 'zout'])
  })

  it('de melding telt toegevoegd en overgeslagen', () => {
    expect(skippedMessage(5, 2)).toBe('5 toegevoegd, 2 al in huis.')
    expect(skippedMessage(0, 2)).toBe('Niets toegevoegd: alles is al in huis (2).')
    expect(skippedMessage(3, 0)).toBeNull()
  })
})

describe('alternativeHint', () => {
  const row = (alternatives, swaps = {}) =>
    applySwaps([{ id: 12, ingredient_id: 1, name: 'kip', alternatives }], swaps)[0]
  const alternative = (id, ingredientId, name) => ({ id, ingredient_id: ingredientId, name })

  it('niet in huis, een alternatief wel: noemt dat', () => {
    expect(
      alternativeHint(row([alternative(3, 6, 'peper'), alternative(4, 2, 'rijst')]), statusOf),
    ).toEqual({ name: 'rijst', alternativeId: 4, more: 0 })
  })

  it('meerdere alternatieven in huis: de eerste, met hoeveel er nog meer zijn', () => {
    expect(
      alternativeHint(row([alternative(3, 3, 'zout'), alternative(4, 2, 'rijst')]), statusOf),
    ).toEqual({ name: 'zout', alternativeId: 3, more: 1 })
  })

  it('geen alternatief in huis, of het ingrediënt zelf is in huis: geen hint', () => {
    expect(alternativeHint(row([alternative(3, 6, 'peper')]), statusOf)).toBeNull()
    const inHouseRow = applySwaps(
      [{ id: 12, ingredient_id: 2, name: 'rijst', alternatives: [alternative(3, 3, 'zout')] }],
      {},
    )[0]
    expect(alternativeHint(inHouseRow, statusOf)).toBeNull()
  })

  it('gewisseld naar iets dat niet in huis is: terugwisselen naar het origineel als dat er is', () => {
    const swapped = applySwaps(
      [{ id: 12, ingredient_id: 2, name: 'rijst', alternatives: [alternative(3, 6, 'peper')] }],
      { 12: 3 },
    )[0]
    expect(alternativeHint(swapped, statusOf)).toEqual({
      name: 'rijst',
      alternativeId: null,
      more: 0,
    })
  })
})
