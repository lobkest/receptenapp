// Automatische tags (vegetarisch, veganistisch, glutenvrij, lactosevrij, notenvrij): de server rekent
// ze uit de kenmerken van de ingrediënten (RecipeTagEvaluator). Een recept heeft er alleen
// de tags die gelden, elk zo:
//
//   { name: 'vegetarisch', status: 'ja' | 'met_wissel', disclaimer: false,
//     swaps: [{ recipe_ingredient_id: 12, ingredient: 'kip', alternatives: [{ id: 3, name: 'tofu' }] }],
//     without: [{ recipe_ingredient_id: 14, ingredient: 'spekjes', alternative_ids: [] }] }
//
// Pure functies, zodat de kaart, de receptpagina en het filter hetzelfde laten zien.

// De korte uitleg bij een tag: "met tofu i.p.v. kip", "zonder spekjes", of null. swaps:
// de wissels die nu actief zijn ({ regel-id: alternatief-id }, uit ?wissel=). Is de nodige
// wissel al gekozen, dan valt dat deel weg; een optionele regel die gewisseld is voor een
// alternatief dat past, hoeft er ook niet meer uit.
export function tagHint(tag, swaps = {}) {
  const parts = []
  for (const swap of tag.swaps ?? []) {
    const active = swaps[swap.recipe_ingredient_id]
    if (swap.alternatives.some((alternative) => alternative.id === active)) continue
    const names = swap.alternatives.map((alternative) => alternative.name).join(' of ')
    parts.push(`met ${names} i.p.v. ${swap.ingredient}`)
  }
  for (const skip of tag.without ?? []) {
    if (skip.alternative_ids.includes(swaps[skip.recipe_ingredient_id])) continue
    parts.push(`zonder ${skip.ingredient}`)
  }
  return parts.length ? parts.join(', ') : null
}

// [{ name, hint }] in de volgorde van de server: wat de kaart en de receptpagina tonen.
export function automaticTagLabels(recipe, swaps = {}) {
  return (recipe.automatic_tags ?? []).map((tag) => ({ name: tag.name, hint: tagHint(tag, swaps) }))
}

// Alle tags van een recept, handmatig en automatisch, voor het filter.
export function allTagNames(recipe) {
  return [...(recipe.tags ?? []), ...(recipe.automatic_tags ?? []).map((tag) => tag.name)]
}

// Bij glutenvrij, lactosevrij en notenvrij: "controleer etiketten".
export function needsDisclaimer(recipe) {
  return (recipe.automatic_tags ?? []).some((tag) => tag.disclaimer)
}
