import { automaticTagLabels } from '@/utils/automaticTags'

// Hoeveel tags een receptkaart laat zien; de rest wordt één "+N"-chip. Zes: de vijf
// automatische tags (vegetarisch, ...) plus minstens één die iemand zelf koos.
export const MAX_CARD_TAGS = 6

// Een tag kan een kale string zijn ("snel") of een object ({ name: "snel" }).
function tagName(tag) {
  return typeof tag === 'string' ? tag : (tag?.name ?? '')
}

// Alle tags die een kaart toont, als [{ name, hint }]. Eerst de automatische tags
// (vegetarisch, ...), met een korte uitleg als er een wissel nodig is ("met tofu i.p.v.
// kip"), dan de tags die iemand zelf koos. Op de kaart is nooit iets gewisseld, dus de
// uitleg staat er altijd bij.
export function cardTags(recipe) {
  return [
    ...automaticTagLabels(recipe),
    ...(Array.isArray(recipe.tags) ? recipe.tags.map(tagName).filter(Boolean) : []).map((name) => ({
      name,
      hint: null,
    })),
  ]
}

// Het aantal chips op de kaart: hoogstens MAX_CARD_TAGS tags, plus 1 voor de "+N"-chip.
export function visibleTagChipCount(recipe) {
  const count = cardTags(recipe).length
  return count > MAX_CARD_TAGS ? MAX_CARD_TAGS + 1 : count
}

// Recepten op kaarthoogte: weinig tag-chips eerst, dan op titel (Nederlandse volgorde).
// Kaarten met evenveel chips komen zo naast elkaar in het grid, met minder witruimte.
// Geeft een nieuwe lijst; de invoer blijft zoals hij was. Het aantal chips één keer per
// recept, niet bij elke vergelijking opnieuw.
export function sortByCardHeight(recipes) {
  const chipCounts = new Map(recipes.map((recipe) => [recipe, visibleTagChipCount(recipe)]))
  return [...recipes].sort(
    (a, b) =>
      chipCounts.get(a) - chipCounts.get(b) || (a.title ?? '').localeCompare(b.title ?? '', 'nl'),
  )
}
