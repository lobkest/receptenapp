import { describe, it, expect } from 'vitest'
import { toggleTrait, traitConsequence } from '../utils/traits'

const TRAITS = [
  { name: 'vlees', excluded_by: ['vegetarisch'] },
  { name: 'vis', excluded_by: ['vegetarisch'] },
  { name: 'dierlijk', excluded_by: ['veganistisch'] },
  { name: 'gluten', excluded_by: ['glutenvrij'] },
  { name: 'lactose', excluded_by: ['lactosevrij'] },
]

describe('traitConsequence', () => {
  it('kip: niet vegetarisch, niet veganistisch', () => {
    expect(traitConsequence(['vlees', 'dierlijk'], TRAITS)).toBe('niet vegetarisch, niet veganistisch')
  })

  it('vlees en vis samen noemen vegetarisch één keer', () => {
    expect(traitConsequence(['vis', 'vlees', 'dierlijk'], TRAITS)).toBe(
      'niet vegetarisch, niet veganistisch',
    )
  })

  it('zonder kenmerken past het bij alles', () => {
    expect(traitConsequence([], TRAITS)).toBe('past bij alle automatische tags')
  })
})

describe('toggleTrait', () => {
  it('zet aan en uit, in de vaste volgorde', () => {
    expect(toggleTrait(['dierlijk'], 'vlees', TRAITS)).toEqual(['vlees', 'dierlijk'])
    expect(toggleTrait(['vlees', 'dierlijk'], 'vlees', TRAITS)).toEqual(['dierlijk'])
  })
})
