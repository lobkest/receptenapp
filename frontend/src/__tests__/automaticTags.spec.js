import { describe, it, expect } from 'vitest'
import { allTagNames, automaticTagLabels, needsDisclaimer, tagHint } from '../utils/automaticTags'

const VEGETARISCH = {
  name: 'vegetarisch',
  status: 'met_wissel',
  disclaimer: false,
  swaps: [{ recipe_ingredient_id: 12, ingredient: 'kip', alternatives: [{ id: 3, name: 'tofu' }] }],
  without: [],
}

describe('tagHint', () => {
  it('geeft "met tofu i.p.v. kip" zolang de wissel niet actief is', () => {
    expect(tagHint(VEGETARISCH)).toBe('met tofu i.p.v. kip')
    expect(tagHint(VEGETARISCH, { 99: 3 })).toBe('met tofu i.p.v. kip')
  })

  it('de hint verdwijnt als de nodige wissel actief is', () => {
    expect(tagHint(VEGETARISCH, { 12: 3 })).toBeNull()
  })

  it('een wissel naar een alternatief dat niet past, telt niet', () => {
    expect(tagHint(VEGETARISCH, { 12: 4 })).toBe('met tofu i.p.v. kip')
  })

  it('meerdere geschikte alternatieven: allemaal, met "of"', () => {
    const tag = {
      ...VEGETARISCH,
      swaps: [
        {
          ...VEGETARISCH.swaps[0],
          alternatives: [
            { id: 3, name: 'tofu' },
            { id: 4, name: 'tempeh' },
          ],
        },
      ],
    }
    expect(tagHint(tag)).toBe('met tofu of tempeh i.p.v. kip')
    expect(tagHint(tag, { 12: 4 })).toBeNull()
  })

  it('een genegeerd optioneel ingrediënt: "zonder spekjes", weg na een passende wissel', () => {
    const tag = {
      name: 'vegetarisch',
      status: 'ja',
      swaps: [],
      without: [{ recipe_ingredient_id: 14, ingredient: 'spekjes', alternative_ids: [8] }],
    }
    expect(tagHint(tag)).toBe('zonder spekjes')
    expect(tagHint(tag, { 14: 8 })).toBeNull()
    expect(tagHint({ ...tag, swaps: VEGETARISCH.swaps })).toBe(
      'met tofu i.p.v. kip, zonder spekjes',
    )
  })

  it('status ja zonder uitzonderingen: geen hint', () => {
    expect(tagHint({ name: 'glutenvrij', status: 'ja', swaps: [], without: [] })).toBeNull()
  })
})

describe('automaticTagLabels, allTagNames en needsDisclaimer', () => {
  const recipe = {
    tags: ['snel'],
    automatic_tags: [
      VEGETARISCH,
      { name: 'glutenvrij', status: 'ja', disclaimer: true, swaps: [], without: [] },
    ],
  }

  it('labels met hint, naar de actieve wissels', () => {
    expect(automaticTagLabels(recipe)).toEqual([
      { name: 'vegetarisch', hint: 'met tofu i.p.v. kip' },
      { name: 'glutenvrij', hint: null },
    ])
    expect(automaticTagLabels(recipe, { 12: 3 })[0].hint).toBeNull()
  })

  it('alle tagnamen voor het filter, en de disclaimer bij glutenvrij', () => {
    expect(allTagNames(recipe)).toEqual(['snel', 'vegetarisch', 'glutenvrij'])
    expect(needsDisclaimer(recipe)).toBe(true)
    expect(needsDisclaimer({ automatic_tags: [VEGETARISCH] })).toBe(false)
    expect(allTagNames({})).toEqual([])
  })
})
