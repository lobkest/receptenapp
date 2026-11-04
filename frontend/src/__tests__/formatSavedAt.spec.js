import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatSavedAt, oldestSavedAt } from '../offline'

// Datums via new Date(jaar, maand, dag, uur, minuut): dat is lokale tijd, dus de tests
// kloppen in elke tijdzone. De klok staat stil met fake timers (vi.setSystemTime), zodat
// formatSavedAt zonder tweede argument Date.now() van de test gebruikt.
const at = (...parts) => new Date(...parts).getTime()

describe('formatSavedAt', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('zelfde kalenderdag: "vandaag" met de tijd', () => {
    vi.setSystemTime(new Date(2026, 10, 3, 20, 0))
    expect(formatSavedAt(at(2026, 10, 3, 18, 0))).toBe('vandaag 18:00')
    expect(formatSavedAt(at(2026, 10, 3, 0, 5))).toBe('vandaag 00:05')
  })

  it('vorige kalenderdag: "gisteren" met de tijd', () => {
    vi.setSystemTime(new Date(2026, 10, 3, 20, 0))
    expect(formatSavedAt(at(2026, 10, 2, 18, 0))).toBe('gisteren 18:00')
    // Meer dan 24 uur geleden, maar nog steeds gisteren.
    expect(formatSavedAt(at(2026, 10, 2, 9, 7))).toBe('gisteren 09:07')
  })

  it('ouder: "n dagen geleden" zonder tijd', () => {
    vi.setSystemTime(new Date(2026, 10, 3, 20, 0))
    expect(formatSavedAt(at(2026, 10, 1, 23, 59))).toBe('2 dagen geleden')
    expect(formatSavedAt(at(2026, 9, 31, 8, 0))).toBe('3 dagen geleden')
  })

  it('rond middernacht telt de kalenderdag, niet 24 uur', () => {
    // 20 minuten geleden, maar vóór middernacht: gisteren.
    vi.setSystemTime(new Date(2026, 10, 3, 0, 10))
    expect(formatSavedAt(at(2026, 10, 2, 23, 50))).toBe('gisteren 23:50')
    expect(formatSavedAt(at(2026, 10, 3, 0, 0))).toBe('vandaag 00:00')
    // Net na middernacht van eergisteren: al 2 dagen, ook al is het maar 24 uur en 11 minuten.
    expect(formatSavedAt(at(2026, 10, 1, 23, 59))).toBe('2 dagen geleden')

    // Eén minuut voor middernacht: nog vandaag; een minuut later is dat gisteren.
    vi.setSystemTime(new Date(2026, 10, 3, 23, 59))
    expect(formatSavedAt(at(2026, 10, 3, 0, 1))).toBe('vandaag 00:01')
    vi.setSystemTime(new Date(2026, 10, 4, 0, 0))
    expect(formatSavedAt(at(2026, 10, 3, 0, 1))).toBe('gisteren 00:01')
  })

  it('opgeslagen 3 nov 23:30 lokale tijd, getoond 4 nov 00:10: "gisteren 23:30"', () => {
    vi.setSystemTime(new Date(2026, 10, 4, 0, 10))
    expect(formatSavedAt(at(2026, 10, 3, 23, 30))).toBe('gisteren 23:30')
  })

  it('over de jaargrens en de wisseling naar wintertijd heen', () => {
    vi.setSystemTime(new Date(2027, 0, 1, 0, 30))
    expect(formatSavedAt(at(2026, 11, 31, 22, 0))).toBe('gisteren 22:00')
    // In Nederland is 25 oktober 2026 een dag van 25 uur.
    vi.setSystemTime(new Date(2026, 9, 26, 1, 0))
    expect(formatSavedAt(at(2026, 9, 25, 0, 30))).toBe('gisteren 00:30')
    expect(formatSavedAt(at(2026, 9, 24, 23, 30))).toBe('2 dagen geleden')
  })

  it('een tijdstip in de toekomst (klok verzet) telt als vandaag', () => {
    vi.setSystemTime(new Date(2026, 10, 3, 12, 0))
    expect(formatSavedAt(at(2026, 10, 3, 12, 30))).toBe('vandaag 12:30')
  })
})

describe('oldestSavedAt', () => {
  it('neemt het oudste tijdstip en slaat onbekende (null) over', () => {
    expect(oldestSavedAt(300, 100, null, 200)).toBe(100)
    expect(oldestSavedAt(null, 50)).toBe(50)
    expect(oldestSavedAt(null, undefined)).toBe(null)
  })
})
