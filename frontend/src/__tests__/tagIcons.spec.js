import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { IconClock, IconLeaf, IconSnowflake } from '@tabler/icons-vue'
import { tagIcon } from '../utils/tagIcons'

describe('tagIcon', () => {
  it('geeft het icoon bij een bekende tag, ook met hoofdletters en spaties', () => {
    expect(tagIcon('vegetarisch')).toBe(IconLeaf)
    expect(tagIcon('  Snel ')).toBe(IconClock)
    expect(tagIcon('vriezer')).toBe(IconSnowflake)
    expect(tagIcon('invriezen')).toBe(IconSnowflake)
  })

  it('geeft null bij een vrije tag of iets anders dan tekst', () => {
    expect(tagIcon('zomer')).toBeNull()
    expect(tagIcon('')).toBeNull()
    expect(tagIcon(null)).toBeNull()
  })

  it('tekent notenvrij als noot met een diagonale streep', () => {
    const wrapper = mount(tagIcon('notenvrij'), { props: { size: 16 } })

    expect(wrapper.find('svg').classes()).toContain('tabler-icon-nut')
    expect(wrapper.find('svg').attributes('width')).toBe('16')
    expect(wrapper.findAll('path').map((path) => path.attributes('d'))).toContain('M3 3l18 18')
  })
})
