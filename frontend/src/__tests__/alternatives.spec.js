import { describe, it, expect } from 'vitest'
import {
  applySwaps,
  formatSwaps,
  parseSwaps,
  swappedAlternativeIds,
  swapRow,
} from '../utils/alternatives'
import { scaleQuantity } from '../utils/quantity'

const INGREDIENTS = [
  {
    id: 12,
    name: 'kip',
    quantity: 250,
    unit: 'g',
    optional: false,
    alternatives: [
      { id: 3, name: 'tofu', quantity: null, unit: null, effective_quantity: 250, effective_unit: 'g' },
      { id: 4, name: 'tempeh', quantity: 200, unit: 'g', effective_quantity: 200, effective_unit: 'g' },
    ],
  },
  { id: 13, name: 'rijst', quantity: 150, unit: 'g', optional: false, alternatives: [] },
  {
    id: 15,
    name: 'koriander',
    quantity: 5,
    unit: 'g',
    optional: true,
    alternatives: [
      { id: 7, name: 'peterselie', quantity: null, unit: null, effective_quantity: 5, effective_unit: 'g' },
    ],
  },
]

describe('parseSwaps', () => {
  it('leest ?wissel=12:3,15:7', () => {
    expect(parseSwaps('12:3,15:7', INGREDIENTS)).toEqual({ 12: 3, 15: 7 })
  })

  it('negeert ongeldige, onbekende en verouderde ids zonder fout', () => {
    // 99: geen regel; 13:3: alternatief van een andere regel; 12:8: bestaat niet (meer).
    expect(parseSwaps('99:3,13:3,12:8,abc,12:,:3,, 15:7 ,1.5:2', INGREDIENTS)).toEqual({ 15: 7 })
    expect(parseSwaps('', INGREDIENTS)).toEqual({})
    expect(parseSwaps(undefined, INGREDIENTS)).toEqual({})
    expect(parseSwaps(null, INGREDIENTS)).toEqual({})
    expect(parseSwaps('12:3', [])).toEqual({})
  })

  it('één wissel per regel: de eerste telt', () => {
    expect(parseSwaps('12:4,12:3', INGREDIENTS)).toEqual({ 12: 4 })
  })

  it('kan ook een lijst aan (twee keer wissel= in de query)', () => {
    expect(parseSwaps(['12:3', '15:7'], INGREDIENTS)).toEqual({ 12: 3, 15: 7 })
  })

  it('werkt met regels zonder alternatives-veld (oude cache)', () => {
    expect(parseSwaps('1:2', [{ id: 1, name: 'bloem' }])).toEqual({})
  })
})

describe('formatSwaps', () => {
  it('schrijft de wissels in de volgorde van de ingrediënten', () => {
    expect(formatSwaps({ 15: 7, 12: 3 }, INGREDIENTS)).toBe('12:3,15:7')
  })

  it('geeft undefined zonder wissels, zodat ?wissel= verdwijnt', () => {
    expect(formatSwaps({}, INGREDIENTS)).toBeUndefined()
  })

  it('gaat heen en terug zonder verlies', () => {
    const swaps = { 12: 4, 15: 7 }
    expect(parseSwaps(formatSwaps(swaps, INGREDIENTS), INGREDIENTS)).toEqual(swaps)
  })
})

describe('swapRow', () => {
  it('wisselt, wisselt door en zet terug zonder het oude object te veranderen', () => {
    const start = {}
    const one = swapRow(start, 12, 3)
    const two = swapRow(one, 12, 4)
    const back = swapRow(two, 12, null)

    expect([start, one, two, back]).toEqual([{}, { 12: 3 }, { 12: 4 }, {}])
  })
})

describe('applySwaps', () => {
  it('zonder wissel: de regel zelf, met alle alternatieven als keuze', () => {
    const [kip, rijst] = applySwaps(INGREDIENTS, {})

    expect(kip).toMatchObject({ name: 'kip', quantity: 250, unit: 'g', original: null })
    expect(kip.others.map((a) => a.name)).toEqual(['tofu', 'tempeh'])
    expect(rijst.others).toEqual([])
  })

  it('gewisseld: naam en effectieve hoeveelheid van het alternatief; id en optioneel blijven', () => {
    const [kip, , koriander] = applySwaps(INGREDIENTS, { 12: 4, 15: 7 })

    expect(kip).toMatchObject({ id: 12, name: 'tempeh', quantity: 200, unit: 'g', alternativeId: 4 })
    expect(kip.original.name).toBe('kip')
    expect(kip.others.map((a) => a.name)).toEqual(['tofu'])
    // "zelfde als origineel": de hoeveelheid van koriander, en het alternatief erft optioneel.
    expect(koriander).toMatchObject({ name: 'peterselie', quantity: 5, unit: 'g', optional: true })
  })

  it('schaalt daarna gewoon mee met de porties', () => {
    const [kip] = applySwaps(INGREDIENTS, { 12: 3 })
    const [tempeh] = applySwaps(INGREDIENTS, { 12: 4 })

    expect(scaleQuantity(kip.quantity, 6 / 4, kip.unit)).toBe(375)
    expect(scaleQuantity(tempeh.quantity, 1 / 4, tempeh.unit)).toBe(50)
  })

  it('verandert de ingrediënten zelf niet', () => {
    const before = structuredClone(INGREDIENTS)
    applySwaps(INGREDIENTS, { 12: 3 })
    expect(INGREDIENTS).toEqual(before)
  })
})

describe('swappedAlternativeIds', () => {
  it('geeft de ids van de gekozen alternatieven', () => {
    expect(swappedAlternativeIds({ 12: 3, 15: 7 })).toEqual([3, 7])
    expect(swappedAlternativeIds({})).toEqual([])
  })
})
