import { STANDARD_SOURCE } from '@/utils/shoppingListLine'

// "Recepten op je lijst" en "Groepeer per recept" op de boodschappenlijst. Alles wordt
// afgeleid uit de regels zelf (ook offline, uit de opgeslagen kopie).
//
// Bij welk recept hoort een regel?
//   recipe_id                       → dat recept (ook een variatie: die bewaart het
//                                      recept-id, alleen source_label is "… (variatie: …)")
//   geen recipe_id, wel source_label → een verwijderd recept (de database zette recipe_id
//                                      op NULL; de naam staat nog in source_label)
//   anders                          → los of van de standaardlijst
// Een receptregel die ook van de standaardlijst kwam ("melk 200 ml +1") hoort bij het recept.

export const LOOSE_TITLE = 'Los / standaardlijst'

// Een sleutel per recept, of null voor een losse regel.
export function recipeKeyOf(item) {
  if (item.recipe_id != null) return `recept-${item.recipe_id}`
  if (item.source_label && item.source_label !== STANDARD_SOURCE)
    return `label-${item.source_label}`
  return null
}

// De naam van het recept. recipe_title komt van de server (de huidige naam); een oude
// opgeslagen kopie heeft die nog niet, dan de herkomst.
function recipeTitleOf(item) {
  return item.recipe_title ?? item.source_label ?? 'Recept'
}

// Per recept de regels, in de volgorde van de lijst. Map: sleutel → { …, items }.
function byRecipe(items) {
  const groups = new Map()
  for (const item of items) {
    const key = recipeKeyOf(item)
    if (key == null) continue
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        recipeId: item.recipe_id ?? null,
        // Alleen voor een verwijderd recept: daarop zoekt de server de regels.
        sourceLabel: item.recipe_id == null ? item.source_label : null,
        title: recipeTitleOf(item),
        // Een link alleen als het recept nog te zien is (geen verwijderverzoek).
        linkable: item.recipe_id != null && item.recipe_visible !== false,
        items: [],
      })
    }
    groups.get(key).items.push(item)
  }
  return groups
}

// Het hoogste id: de laatst toegevoegde regel.
function lastId(items) {
  return Math.max(...items.map((item) => item.id))
}

// Het vakje "Recepten op je lijst": één rij per recept met minstens één open regel,
// het recept met de laatst toegevoegde open regel bovenaan.
//   openCount: open regels van dit recept
//   keptCount: daarvan ook van de standaardlijst; die blijven bij "Verwijder" staan
export function recipesOnList(items) {
  const open = items.filter((item) => !item.checked)
  return [...byRecipe(open).values()]
    .map(({ items: lines, ...group }) => ({
      ...group,
      openCount: lines.length,
      keptCount: lines.filter((item) => item.standard_count > 0).length,
      lastId: lastId(lines),
    }))
    .sort((a, b) => b.lastId - a.lastId)
}

// "Groepeer per recept": een sectie per recept (open én afgevinkte regels, in de volgorde
// van de lijst), het recept met de laatst toegevoegde regel bovenaan, en daarna
// "Los / standaardlijst". Lege secties vallen weg.
export function groupByRecipe(items) {
  const sections = [...byRecipe(items).values()]
    .map(({ key, title, items: lines }) => ({ key, title, items: lines }))
    .sort((a, b) => lastId(b.items) - lastId(a.items))
  const loose = items.filter((item) => recipeKeyOf(item) == null)
  if (loose.length) sections.push({ key: 'los', title: LOOSE_TITLE, items: loose })
  return sections
}

function itemsText(count) {
  return count === 1 ? '1 item' : `${count} items`
}

// De vraag in de bevestiging bij "Verwijder": { title, text } voor ConfirmDialog.
export function removeRecipeQuestion(recipe) {
  const removed = recipe.openCount - recipe.keptCount
  const title =
    removed > 0
      ? `${itemsText(removed)} van '${recipe.title}' van de lijst halen?`
      : `'${recipe.title}' van de lijst halen?`
  let text = 'Afgevinkte regels blijven staan.'
  if (recipe.keptCount === 1) {
    text = `1 item blijft staan omdat het ook via de standaardlijst is toegevoegd. ${text}`
  } else if (recipe.keptCount > 1) {
    text = `${recipe.keptCount} items blijven staan omdat ze ook via de standaardlijst zijn toegevoegd. ${text}`
  }
  return { title, text }
}
