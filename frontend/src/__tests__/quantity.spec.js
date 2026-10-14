import { describe, it, expect } from 'vitest'
import { roundQuantity, scaleQuantity, formatQuantity } from '../utils/quantity'
// Vite leest JSON als module; het bestand staat bij de Rails-testbestanden (zie onderaan).
import { cases } from '../../../test/fixtures/files/quantity_cases.json'

describe('roundQuantity', () => {
  it('rondt g en ml vanaf 10 af op hele getallen', () => {
    expect(roundQuantity(213.7, 'g')).toBe(214)
    expect(roundQuantity(10.4, 'ml')).toBe(10)
    expect(roundQuantity(1249.6, 'g')).toBe(1250)
  })

  it('geeft g en ml onder 10 één decimaal', () => {
    expect(roundQuantity(2.25, 'ml')).toBe(2.3)
    expect(roundQuantity(9.94, 'g')).toBe(9.9)
    expect(roundQuantity(0.5, 'ml')).toBe(0.5)
  })

  it('rondt net onder 10 niet onnodig af naar een decimaal', () => {
    expect(roundQuantity(9.96, 'g')).toBe(10)
  })

  it('rondt stuks af op 0,5', () => {
    expect(roundQuantity(1.3, 'stuks')).toBe(1.5)
    expect(roundQuantity(1.2, 'stuks')).toBe(1)
    expect(roundQuantity(0.5, 'stuks')).toBe(0.5)
    expect(roundQuantity(7.75, 'stuks')).toBe(8)
  })

  it('rondt een kleine positieve hoeveelheid nooit af naar 0', () => {
    expect(roundQuantity(0.2, 'stuks')).toBe(0.5)
    expect(roundQuantity(0.01, 'g')).toBe(0.1)
    expect(roundQuantity(0.001, 'snuf')).toBe(0.01)
  })

  it('geeft een onbekende eenheid maximaal twee decimalen', () => {
    expect(roundQuantity(1.23456, 'snuf')).toBe(1.23)
  })

  it('laat "naar smaak" (null) ongemoeid', () => {
    expect(roundQuantity(null, 'g')).toBeNull()
  })
})

describe('scaleQuantity', () => {
  it('vermenigvuldigt met de factor en rondt af', () => {
    expect(scaleQuantity(200, 6 / 4, 'g')).toBe(300)
    expect(scaleQuantity(3, 2 / 4, 'stuks')).toBe(1.5)
    expect(scaleQuantity(250, 50 / 4, 'ml')).toBe(3125)
  })

  it('schaalt 1 ei voor 4 naar 1 persoon tot 0,5 stuks, niet 0', () => {
    expect(scaleQuantity(1, 1 / 4, 'stuks')).toBe(0.5)
  })

  it('schaalt kleine hoeveelheden met één decimaal', () => {
    expect(scaleQuantity(5, 1 / 3, 'ml')).toBe(1.7)
  })

  it('houdt "naar smaak" gelijk', () => {
    expect(scaleQuantity(null, 3, null)).toBeNull()
  })

  it('verandert niets bij factor 1', () => {
    expect(scaleQuantity(0.5, 1, 'ml')).toBe(0.5)
  })
})

describe('formatQuantity', () => {
  it('gebruikt de Nederlandse notatie', () => {
    expect(formatQuantity(0.5)).toBe('0,5')
    expect(formatQuantity(1250)).toBe('1.250')
    expect(formatQuantity(2)).toBe('2')
  })
})

// Dezelfde gevallen als test/models/quantity_test.rb, uit één gedeeld bestand: de
// receptpagina (hier) en de boodschappenlijst (de server) rekenen zo altijd hetzelfde.

describe('gedeelde testgevallen met de server', () => {
  it.each(cases)(
    '$quantity $unit × $servings/$base is $expected',
    ({ quantity, servings, base, unit, expected }) => {
      const result = scaleQuantity(quantity, servings / base, unit)
      expect(result).toBe(expected === null ? null : Number(expected))
    },
  )
})
