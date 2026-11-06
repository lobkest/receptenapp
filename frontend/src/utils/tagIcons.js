import { h } from 'vue'
import {
  IconClock,
  IconEgg,
  IconEggOff,
  IconFish,
  IconLeaf,
  IconMeat,
  IconMilkOff,
  IconNut,
  IconPepper,
  IconPlant2,
  IconSnowflake,
  IconWheatOff,
} from '@tabler/icons-vue'

// Een icoon bij bekende tags, voor de receptkaarten en de filterchips. Iconen los
// geïmporteerd: zo komen alleen deze in de bundel, niet het hele pakket van Tabler.

// Tabler heeft geen "noot doorgestreept". Zelfde streep als de andere -off-iconen
// (IconWheatOff, IconMilkOff): een diagonaal van linksboven naar rechtsonder, als extra
// pad in hetzelfde <svg> (de iconen van Tabler tekenen hun default-slot mee).
function IconNutOff(props) {
  return h(IconNut, props, { default: () => h('path', { d: 'M3 3l18 18' }) })
}
IconNutOff.props = ['size', 'stroke']

const TAG_ICONS = {
  vegetarisch: IconLeaf,
  veganistisch: IconPlant2,
  glutenvrij: IconWheatOff,
  lactosevrij: IconMilkOff,
  notenvrij: IconNutOff,
  snel: IconClock,
  vis: IconFish,
  vlees: IconMeat,
  pittig: IconPepper,
  ei: IconEgg,
  eivrij: IconEggOff,
  vriezer: IconSnowflake,
  invriezen: IconSnowflake,
}

// Het icoon-component bij een tagnaam (hoofdletters en spaties eromheen tellen niet
// mee), of null voor een tag zonder icoon (een vrij getypte tag).
export function tagIcon(name) {
  if (typeof name !== 'string') return null
  return TAG_ICONS[name.trim().toLowerCase()] ?? null
}
