// Ingrediënt wisselen op de receptpagina: "⇄ tofu" onder "kip". Pure functies, zodat de
// receptpagina (staat in de URL), de ingrediëntenlijst en "op lijst" hetzelfde rekenen.
//
// Een wissel is { [id van de receptregel]: id van het alternatief }, bijv. { 12: 3 }.
// In de URL: ?wissel=12:3,15:7.

// "12:3,15:7" (of een lijst daarvan, als de query twee keer wissel= heeft) naar
// { 12: 3, 15: 7 }. Alleen paren die bij dit recept horen tellen; de rest (een oude link,
// een verwijderd alternatief, onzin) wordt stil genegeerd. Eén wissel per regel: de eerste telt.
export function parseSwaps(value, ingredients) {
  const text = Array.isArray(value) ? value.join(',') : (value ?? '')
  const swaps = {}

  for (const pair of String(text).split(',')) {
    const match = pair.trim().match(/^(\d+):(\d+)$/)
    if (!match) continue

    const [rowId, alternativeId] = [Number(match[1]), Number(match[2])]
    const row = ingredients.find((ingredient) => ingredient.id === rowId)
    const known = row?.alternatives?.some((alternative) => alternative.id === alternativeId)
    if (known && !(rowId in swaps)) swaps[rowId] = alternativeId
  }

  return swaps
}

// Terug naar de URL-vorm, in de volgorde van de ingrediënten; undefined zonder wissels,
// zodat ?wissel= dan uit de URL verdwijnt.
export function formatSwaps(swaps, ingredients) {
  const pairs = ingredients
    .filter((ingredient) => swaps[ingredient.id] != null)
    .map((ingredient) => `${ingredient.id}:${swaps[ingredient.id]}`)
  return pairs.length ? pairs.join(',') : undefined
}

// Een nieuwe wissel (alternativeId) of terug naar het origineel (null). Geeft een nieuw
// object terug; het oude blijft zoals het was.
export function swapRow(swaps, rowId, alternativeId) {
  const next = { ...swaps }
  if (alternativeId == null) {
    delete next[rowId]
  } else {
    next[rowId] = alternativeId
  }
  return next
}

// De regels zoals ze nu gelden: een gewisselde regel krijgt het ingrediënt (ingredient_id,
// naam) en de (effectieve) hoeveelheid van het alternatief. id en optional blijven die van de regel. original:
// de regel zelf, voor "↺ kip"; null als hij niet gewisseld is. others: de alternatieven
// die je nu nog kunt kiezen.
export function applySwaps(ingredients, swaps) {
  return ingredients.map((row) => {
    const alternatives = row.alternatives ?? []
    const chosen = alternatives.find((alternative) => alternative.id === swaps[row.id])
    const others = alternatives.filter((alternative) => alternative !== chosen)
    if (!chosen) return { ...row, original: null, alternativeId: null, others }

    return {
      ...row,
      ingredient_id: chosen.ingredient_id,
      name: chosen.name,
      quantity: chosen.effective_quantity,
      unit: chosen.effective_unit,
      original: row,
      alternativeId: chosen.id,
      others,
    }
  })
}

// Voor "op lijst": de ids van de gekozen alternatieven. De server leidt de regel af.
export function swappedAlternativeIds(swaps) {
  return Object.values(swaps)
}
