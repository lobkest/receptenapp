import { normalizeName } from '@/stores/shoppingList'

// "In huis" op de receptpagina en de standaardlijst. Pure functies, zodat het huisje, het
// overslaan bij "Alles op lijst" en de wissel-hint hetzelfde rekenen.
//
// In huis = het ingrediënt staat in de voorraad: wat extra in huis is, plus de basisvoorraad
// die niet op is (zie app/models/pantry_item.rb). Matchen zoals bij "op lijst": op
// ingredient_id, en zonder ingredient_id (standaarditem, toevoeging van een variatie) op naam
// tegen de bestaande ingrediënten. Geen match: geen huisje.

// De ids die in huis zijn, uit /api/pantry ({ in_house, staples }). null zolang de voorraad
// niet geladen is: dan tonen we geen huisjes in plaats van overal "niet in huis".
export function presentIngredientIds(pantry) {
  if (!pantry) return null
  return new Set([
    ...pantry.in_house.map((ingredient) => ingredient.id),
    ...pantry.staples.filter((staple) => staple.present).map((staple) => staple.id),
  ])
}

// Naam → ingrediënt-id, voor regels zonder ingredient_id.
export function ingredientIdsByName(ingredients) {
  return new Map(ingredients.map((ingredient) => [normalizeName(ingredient.name), ingredient.id]))
}

// { ingredientId, inHouse } voor een ingrediënt ({ ingredient_id, name }), of null als het
// niet bij een bestaand ingrediënt hoort (of de voorraad er nog niet is).
// lookup: { presentIds, idByName }.
export function houseStatus(ingredient, { presentIds, idByName }) {
  if (!presentIds) return null
  const id = ingredient.ingredient_id ?? idByName.get(normalizeName(ingredient.name)) ?? null
  if (id == null) return null
  return { ingredientId: id, inHouse: presentIds.has(id) }
}

// Voor "Alles op lijst", "Variatie op lijst" en "Op lijst (n)": wat erop moet en wat al
// in huis is (dat slaan we over). statusOf: ingrediënt → houseStatus.
export function splitInHouse(items, statusOf) {
  const toAdd = []
  const inHouse = []
  for (const item of items) (statusOf(item)?.inHouse ? inHouse : toAdd).push(item)
  return { toAdd, inHouse }
}

// "5 toegevoegd, 2 al in huis." Zonder iets in huis null: dan de gewone melding.
export function skippedMessage(added, skipped) {
  if (skipped === 0) return null
  if (added === 0) return `Niets toegevoegd: alles is al in huis (${skipped}).`
  return `${added} toegevoegd, ${skipped} al in huis.`
}

// De hint "kidneybonen in huis → wissel" onder een ingrediënt dat niet in huis is, maar
// waarvan een alternatief wel in huis is. row: een regel van applySwaps (met original en
// others). Is de regel al gewisseld, dan telt het origineel ook als keuze (terugwisselen).
// Geeft { name, alternativeId (null: terug naar het origineel), more } of null.
export function alternativeHint(row, statusOf) {
  if (statusOf(row)?.inHouse) return null
  const choices = [
    ...(row.original ? [{ ...row.original, alternativeId: null }] : []),
    ...row.others.map((alternative) => ({ ...alternative, alternativeId: alternative.id })),
  ]
  const present = choices.filter((choice) => statusOf(choice)?.inHouse)
  if (present.length === 0) return null
  return {
    name: present[0].name,
    alternativeId: present[0].alternativeId,
    more: present.length - 1,
  }
}
