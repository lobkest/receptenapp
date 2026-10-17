import { allTagNames } from '@/utils/automaticTags'

// De secties op het receptentabblad: één per categorie, op volgorde (position), en
// "Overig" voor recepten zonder categorie als laatste. Los van de view, zodat het
// zonder component te testen is.

// De sleutel van "Overig", ook in de URL (?category=overig). Een echte categorie heeft
// haar id als sleutel; "Overig" kan dus niet botsen (en de server weigert die naam).
export const NO_CATEGORY = 'overig'
export const NO_CATEGORY_NAME = 'Overig'

// '3' voor { id: 3, ... }, NO_CATEGORY voor null.
export function categoryKey(category) {
  return category ? String(category.id) : NO_CATEGORY
}

// Alle categorieën op volgorde: die uit /api/categories, plus die van een recept die daar
// (nog) niet bij staan, bijv. als /api/categories niet laadde of net een nieuwe kreeg.
// Gelijke position: op id, net als op de server.
export function orderedCategories(categories, recipes = []) {
  const byKey = new Map(categories.map((category) => [categoryKey(category), category]))
  for (const { category } of recipes) {
    if (category && !byKey.has(categoryKey(category))) byKey.set(categoryKey(category), category)
  }
  return [...byKey.values()].sort((a, b) => a.position - b.position || a.id - b.id)
}

// Heeft het recept alle gekozen tags, met de hand of automatisch? Zonder gekozen tags: altijd.
function hasAllTags(recipe, tags) {
  const names = allTagNames(recipe)
  return tags.every((tag) => names.includes(tag))
}

// recipes: zoals /api/recipes ze geeft (category is { id, name, position } of null).
// selected: null voor "Alles", anders de categoryKey van één categorie.
// tags: de gekozen tags; een recept moet ze allemaal hebben. De server filtert daar al op,
// maar zo kloppen de secties ook meteen, terwijl de nieuwe lijst nog laadt.
// Geeft [{ key, name, recipes }]; lege secties vallen weg. Binnen een sectie blijft de
// volgorde van de invoer staan.
export function recipeSections(recipes, categories, { selected = null, tags = [] } = {}) {
  const matching = recipes.filter((recipe) => hasAllTags(recipe, tags))
  const sections = [
    ...orderedCategories(categories, recipes).map(({ id, name }) => ({ key: String(id), name })),
    { key: NO_CATEGORY, name: NO_CATEGORY_NAME },
  ]
  return sections
    .filter((section) => selected === null || section.key === selected)
    .map((section) => ({
      ...section,
      recipes: matching.filter((recipe) => categoryKey(recipe.category) === section.key),
    }))
    .filter((section) => section.recipes.length)
}

// De chips bovenaan: "Alles", elke categorie, en "Overig" als er recepten zonder
// categorie zijn (of als "Overig" gekozen is, zodat je hem weer uit kunt zetten).
// key null is "Alles".
export function categoryChips(categories, recipes, selected = null) {
  const chips = [
    { key: null, name: 'Alles' },
    ...orderedCategories(categories, recipes).map(({ id, name }) => ({ key: String(id), name })),
  ]
  if (selected === NO_CATEGORY || recipes.some((recipe) => !recipe.category)) {
    chips.push({ key: NO_CATEGORY, name: NO_CATEGORY_NAME })
  }
  return chips
}

// Zonder secties (bij "Met ingrediënt…", waar de volgorde van de server telt): dezelfde
// filters als recipeSections, de volgorde blijft die van de invoer.
export function filterRecipes(recipes, { selected = null, tags = [] } = {}) {
  return recipes.filter(
    (recipe) =>
      hasAllTags(recipe, tags) && (selected === null || categoryKey(recipe.category) === selected),
  )
}
