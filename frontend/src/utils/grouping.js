// Groepeert items per categorie: categorieën op alfabet, zonder categorie (null)
// als laatste groep. Binnen een groep blijft de volgorde van de invoer staan.
// categoryOf(item) geeft de categorie van een item, of null.
export function groupByCategory(items, categoryOf) {
  const map = new Map()
  for (const item of items) {
    const category = categoryOf(item) ?? null
    if (!map.has(category)) map.set(category, [])
    map.get(category).push(item)
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a === null) - (b === null) || (a ?? '').localeCompare(b ?? '', 'nl'))
    .map(([category, groupItems]) => ({ category, items: groupItems }))
}

// Op naam, met Nederlandse sortering.
export const byName = (a, b) => a.name.localeCompare(b.name, 'nl')
