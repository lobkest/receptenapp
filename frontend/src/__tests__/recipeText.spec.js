import { describe, it, expect } from 'vitest'
import { recipeText } from '../utils/recipeText'

// Zoals app/models/nutrition.rb een regel stuurt: waarden voor het hele recept.
function line(name, values, extra = {}) {
  return {
    id: null,
    ingredient_id: null,
    name,
    grams: null,
    millilitres: null,
    values,
    reason: null,
    source: values ? 'NEVO-product' : null,
    label: false,
    nevo_version: values ? '2025/9.0' : null,
    alternatives: [],
    ...extra,
  }
}

const v = (kcal, protein, carbohydrates, fat, fiber) => ({
  kcal,
  protein,
  carbohydrates,
  fat,
  fiber,
})

// Voor 2 porties. Kip kan tofu (zelfde hoeveelheid) of tempeh (200 g) worden.
const CURRY = {
  id: 5,
  title: 'Curry',
  description: 'Snel doordeweeks.\nMet rijst.',
  servings: 2,
  ingredients: [
    {
      id: 1,
      name: 'kip',
      quantity: 300,
      unit: 'g',
      optional: false,
      alternatives: [
        { id: 7, name: 'tofu', effective_quantity: 300, effective_unit: 'g' },
        { id: 8, name: 'tempeh', effective_quantity: 200, effective_unit: 'g' },
      ],
    },
    { id: 2, name: 'ui', quantity: 1, unit: 'stuks', optional: false, alternatives: [] },
    { id: 3, name: 'zout', quantity: null, unit: null, optional: false, alternatives: [] },
    { id: 4, name: 'koriander', quantity: 5, unit: 'g', optional: true },
  ],
  steps: [
    { id: 11, position: 1, body: 'Ui snijden.' },
    { id: 12, position: 2, body: 'Alles bakken. ' },
  ],
  variations: [
    {
      id: 21,
      name: 'Vegan',
      notes: 'Gebruik kokosyoghurt.',
      changes: [
        { id: 1, kind: 'remove', name: 'kip', quantity: null, unit: null },
        { id: 2, kind: 'add', name: 'kikkererwten', quantity: 200, unit: 'g' },
        { id: 3, kind: 'add', name: 'peper', quantity: null, unit: null },
      ],
      tag_changes: [{ kind: 'add', tag: 'vegan' }],
    },
    { id: 22, name: 'Pittig', notes: null, changes: [], tag_changes: [] },
  ],
}

const BASIC = { id: 6, title: 'Thee', servings: 1, description: null }

describe('recipeText', () => {
  it('zet het hele recept als tekst, met lege regels tussen de delen', () => {
    expect(recipeText(CURRY)).toBe(
      [
        'Curry',
        '2 porties',
        '',
        'Snel doordeweeks.',
        'Met rijst.',
        '',
        'Ingrediënten',
        '- 300 g kip (of: 300 g tofu, 200 g tempeh)',
        '- 1 stuks ui',
        '- zout',
        '- 5 g koriander (optioneel)',
        '',
        'Bereiding',
        '1. Ui snijden.',
        '2. Alles bakken.',
        '',
        'Variaties',
        'Vegan',
        '- zonder kip',
        '- met 200 g kikkererwten',
        '- met peper',
        'Gebruik kokosyoghurt.',
        '',
        'Pittig',
      ].join('\n'),
    )
  })

  it('schaalt alle hoeveelheden naar het gekozen aantal porties', () => {
    const text = recipeText(CURRY, { servings: 3 })

    expect(text).toContain('Curry\n3 porties')
    expect(text).toContain('- 450 g kip (of: 450 g tofu, 300 g tempeh)')
    expect(text).toContain('- 1,5 stuks ui')
    expect(text).toContain('- zout\n')
    expect(text).toContain('- 7,5 g koriander (optioneel)')
    expect(text).toContain('- met 300 g kikkererwten')
  })

  it('zet een gewisseld ingrediënt vooraan, met het origineel als keuze', () => {
    const text = recipeText(CURRY, { swaps: { 1: 8 } })

    expect(text).toContain('- 200 g tempeh (of: 300 g kip, 300 g tofu)')
  })

  it('laat lege delen weg en zegt "1 portie"', () => {
    expect(recipeText(BASIC)).toBe('Thee\n1 portie')
  })

  describe('voedingswaarde', () => {
    const NUTRITION = {
      servings: 2,
      counted: 2,
      lines: [
        line('kip', v(330, 69, 0, 5.4, 0), {
          id: 1,
          alternatives: [line('tofu', v(240, 24, 4, 14, null), { id: 7 })],
        }),
        line('ui', v(40, 1, 8, 0, 2), { id: 2 }),
        line('zout', null, { id: 3, reason: 'geen hoeveelheid' }),
      ],
    }
    const withNutrition = { ...CURRY, nutrition: NUTRITION }

    it('per portie en voor het gekozen aantal, met wat niet meetelt en de bron', () => {
      const text = recipeText(withNutrition, { servings: 4 })

      expect(text.split('\n\n').at(-1)).toBe(
        [
          'Voedingswaarde (schatting)',
          'Per portie: energie ± 190 kcal, eiwit ± 35 g, koolhydraten ± 4 g, vet ± 2,7 g, vezels ± 1 g',
          'Totaal (4 porties): energie ± 740 kcal, eiwit ± 140 g, koolhydraten ± 16 g, vet ± 11 g, vezels ± 4 g',
          'Schatting; 1 ingrediënt niet meegeteld: zout (geen hoeveelheid).',
          'Gebaseerd op gegevens van NEVO-online versie 2025/9.0, RIVM, Bilthoven.',
        ].join('\n'),
      )
    })

    it('rekent met het gewisselde ingrediënt, net als de pagina', () => {
      const text = recipeText(withNutrition, { swaps: { 1: 7 } })

      expect(text).toContain('Per portie: energie ± 140 kcal, eiwit ± 13 g')
      expect(text).toContain('Vezels onbekend voor tofu; niet meegeteld.')
    })

    it('valt weg als er niets meetelt', () => {
      const text = recipeText({ ...CURRY, nutrition: { ...NUTRITION, counted: 0 } })

      expect(text).not.toContain('Voedingswaarde')
    })
  })
})
