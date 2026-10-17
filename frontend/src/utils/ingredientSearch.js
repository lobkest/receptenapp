// Zoeken op ingrediënt: het zoekveld op "In huis" en "Met ingrediënt…" op het
// receptentabblad. Pure functies, zodat ze zonder component te testen zijn.

// Hoeveel gevonden ingrediënten een zoekveld laat zien.
const MAX_MATCHES = 6

// Vanaf zoveel tekens zegt een zoekveld "Geen ingrediënt gevonden" als er niets is.
export const MIN_QUERY_LENGTH = 2

// "  Rode UI " → ['rode', 'ui']: de woorden die er allemaal in moeten staan.
export function searchWords(query) {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean)
}

// Bestaande ingrediënten ([{ id, name }], useIngredientList) waarvan de naam elk woord van
// de zoekterm bevat, zonder die in exclude (een Set met id's). Wat precies zo heet, staat
// bovenaan; daarna op naam.
export function findIngredients(list, query, { exclude = new Set(), max = MAX_MATCHES } = {}) {
  const text = query.trim().toLowerCase()
  const words = searchWords(query)
  if (!words.length) return []
  return list
    .filter((ingredient) => !exclude.has(ingredient.id))
    .filter((ingredient) => words.every((word) => ingredient.name.includes(word)))
    .toSorted((a, b) => (b.name === text) - (a.name === text) || a.name.localeCompare(b.name))
    .slice(0, max)
}

// ?met=12,34 (of een lijst, als de query twee keer met= heeft) naar [12, 34]. Onzin en
// dubbele id's vallen weg.
export function parseIngredientIds(value) {
  const text = Array.isArray(value) ? value.join(',') : (value ?? '')
  const ids = String(text)
    .split(',')
    .map((part) => part.trim())
    .filter((part) => /^\d+$/.test(part))
    .map(Number)
  return [...new Set(ids)]
}

// De korte uitleg op een receptkaart, per gekozen ingrediënt dat niet gewoon als origineel
// in het recept staat: "met courgette i.p.v. aubergine" of "courgette optioneel".
// match: recipe.ingredient_match van /api/recipes?ingredient_ids=...
export function matchHints(match) {
  return (match?.matches ?? []).flatMap((found) => {
    if (found.via === 'optional') return [`${found.name} optioneel`]
    if (found.via === 'alternative' && found.swap) {
      return [`met ${found.swap.alternative} i.p.v. ${found.swap.ingredient}`]
    }
    return []
  })
}

// De wissels voor de receptpagina, in de vorm van ?wissel= ("12:3,15:7"; zie
// utils/alternatives.js), of undefined als er niets te wisselen is.
export function matchSwaps(match) {
  const pairs = (match?.matches ?? [])
    .filter((found) => found.swap)
    .map((found) => `${found.swap.recipe_ingredient_id}:${found.swap.alternative_id}`)
  return pairs.length ? pairs.join(',') : undefined
}

// "courgette", "courgette of aubergine", "courgette, ui of aubergine": een recept heeft
// er minstens één van.
export function joinNames(names) {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} of ${names.at(-1)}`
}
