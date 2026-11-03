import { applySwaps } from '@/utils/alternatives'
import { scaleQuantity } from '@/utils/quantity'
import { isStandardOnly, LOOSE_SOURCE, MAX_COUNT, STANDARD_SOURCE } from '@/utils/shoppingListLine'

// Offline wijzigingen op de boodschappenlijst, alvast zichtbaar (optimistisch) terwijl ze
// nog in de outbox staan (src/offline/outbox.js). Pure functies: wat de server
// waarschijnlijk zal doen, berekend in de browser. Na de sync komt de echte stand van de
// server ervoor in de plaats.
//
// Een regel die alleen hier bestaat, heeft een tijdelijk id ("tmp:<uuid>") en pending: true
// ("wacht op sync"). locked: true als de server bij het versturen zelf rekent welke regels
// het worden ("Alles op lijst", de standaardlijst); zo'n regel kun je pas na de sync
// afstrepen, wijzigen of weghalen. Een bestaande regel waar offline iets bij is geteld,
// krijgt ook pending: true.

// De regel-id uit een target van de outbox: 'shopping:12' → 12, 'shopping:tmp:x' → 'tmp:x'.
export function lineIdOf(target) {
  const id = target.slice('shopping:'.length)
  return /^\d+$/.test(id) ? Number(id) : id
}

export function lineTarget(id) {
  return `shopping:${id}`
}

// Een nieuwe regel in de vorm van de server (ShoppingListItemSerializer).
function newLine(fields) {
  return {
    name: '',
    quantity: null,
    unit: null,
    source_label: null,
    recipe_id: null,
    ingredient_id: null,
    checked: false,
    count: 1,
    standard_count: 0,
    recipe_title: null,
    recipe_visible: false,
    category: null,
    pending: true,
    ...fields,
  }
}

function normalize(name) {
  return String(name ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

// Een open regel zonder hoeveelheid voor hetzelfde ingrediënt (of, zonder ingrediënt,
// dezelfde naam): daar telt een los item bij op, net als ShoppingListItem.add_loose!.
export function looseMatch(items, { name, ingredientId = null }) {
  return items.find(
    (item) =>
      !item.checked &&
      item.quantity == null &&
      !item.locked &&
      (ingredientId != null ? item.ingredient_id === ingredientId : item.name === normalize(name)),
  )
}

// De regels voor "Alles op lijst" of "+ lijst" van recipe (zoals /api/recipes/:id), zoals
// Recipe#shopping_list_items ze zou maken: eerst wisselen, dan schalen. ingredientIds null:
// alles behalve de optionele. skipIds: wat in huis is (de server kijkt bij de sync zelf).
export function recipeLines(
  recipe,
  { servings, ingredientIds = null, alternativeIds = [], skipIds = [] },
) {
  const rows = applySwaps(recipe.ingredients, swapsFor(recipe, alternativeIds))
    .filter((row) => (ingredientIds ? ingredientIds.includes(row.id) : !row.optional))
    .filter((row) => !skipIds.includes(row.id))
  return scaledLines(rows, servings / recipe.servings, {
    source_label: recipe.title,
    recipe_id: recipe.id,
    recipe_title: recipe.title,
    recipe_visible: true,
  })
}

// "Variatie op lijst", zoals RecipeVariation#shopping_list_items: het recept zonder de
// optionele en weggelaten regels, plus wat de variatie toevoegt. skip: { ingredientIds,
// additionIds } (in huis).
export function variationLines(recipe, variation, { servings, alternativeIds = [], skip = {} }) {
  const removed = variation.changes
    .filter((change) => change.kind === 'remove')
    .map((change) => change.recipe_ingredient_id)
  const skipped = [...removed, ...(skip.ingredientIds ?? [])]
  const rows = applySwaps(recipe.ingredients, swapsFor(recipe, alternativeIds)).filter(
    (row) => !row.optional && !skipped.includes(row.id),
  )
  const additions = variation.changes.filter(
    (change) => change.kind === 'add' && !(skip.additionIds ?? []).includes(change.id),
  )
  return scaledLines(
    [...rows, ...additions.map((change) => ({ ...change, ingredient_id: null }))],
    servings / recipe.servings,
    {
      source_label: `${recipe.title} (variatie: ${variation.name})`,
      recipe_id: recipe.id,
      recipe_title: recipe.title,
      recipe_visible: true,
    },
  )
}

// { regel-id: alternatief-id } uit de ids van de gekozen alternatieven.
function swapsFor(recipe, alternativeIds) {
  const swaps = {}
  for (const row of recipe.ingredients) {
    const chosen = (row.alternatives ?? []).find((alternative) =>
      alternativeIds.includes(alternative.id),
    )
    if (chosen) swaps[row.id] = chosen.id
  }
  return swaps
}

function scaledLines(rows, factor, source) {
  return rows.map((row) =>
    newLine({
      name: normalize(row.name),
      quantity: scaleQuantity(row.quantity, factor, row.unit),
      unit: row.quantity == null ? null : row.unit,
      ingredient_id: row.ingredient_id ?? null,
      ...source,
    }),
  )
}

// Past één actie uit de outbox toe op de regels en geeft de nieuwe regels terug.
// categoryOf(name): de categorie van het standaarditem met die naam, of null.
export function applyShoppingAction(items, action, { categoryOf = () => null } = {}) {
  const { payload = {} } = action
  const id = action.target ? lineIdOf(action.target) : null
  const change = (lineId, fn) => items.map((item) => (item.id === lineId ? fn(item) : item))

  switch (action.type) {
    case 'shopping.check':
      return change(id, (item) => ({ ...item, checked: payload.checked }))
    case 'shopping.count':
      return change(id, (item) => ({ ...item, count: payload.count }))
    case 'shopping.delete':
      return items.filter((item) => item.id !== id)
    case 'shopping.addLoose': {
      // into: een bestaande regel waar het bij optelt (zie stores/shoppingList.js#addLoose).
      if (payload.into != null && items.some((item) => item.id === payload.into)) {
        return change(payload.into, (item) => ({
          ...item,
          count: Math.min(item.count + payload.count, MAX_COUNT),
          pending: true,
        }))
      }
      const name = normalize(payload.name)
      return [
        ...items,
        newLine({
          id: `tmp:${action.id}`,
          name,
          ingredient_id: payload.ingredient_id ?? null,
          count: payload.count ?? 1,
          checked: payload.checked ?? false,
          source_label: LOOSE_SOURCE,
          category: categoryOf(name),
        }),
      ]
    }
    case 'shopping.addRecipe':
    case 'shopping.addVariation':
      return [
        ...items,
        ...(action.preview ?? []).map((line, index) => ({
          ...line,
          id: `tmp:${action.id}:${index}`,
          category: categoryOf(line.name),
          locked: true,
        })),
      ]
    case 'shopping.addStandard':
      return payload.names.reduce(
        (lines, name) => addStandard(lines, name, action, categoryOf),
        items,
      )
    default:
      return items
  }
}

// Zoals ShoppingListItem.add_standard!: één erbij op een open regel met die naam (liefst
// een die alleen van de standaardlijst komt), anders een nieuwe standaardregel.
function addStandard(items, name, action, categoryOf) {
  const matching = items.filter((item) => !item.checked && item.name === name && !item.locked)
  const line = matching.find(isStandardOnly) ?? matching[0]
  if (line) {
    return items.map((item) =>
      item === line
        ? {
            ...item,
            count: Math.min(item.count + 1, MAX_COUNT),
            standard_count: item.standard_count + 1,
            pending: true,
          }
        : item,
    )
  }
  return [
    ...items,
    newLine({
      id: `tmp:${action.id}:${name}`,
      name,
      source_label: STANDARD_SOURCE,
      standard_count: 1,
      category: categoryOf(name),
      locked: true,
    }),
  ]
}

// Alle acties voor de boodschappenlijst over de regels van de server heen.
export function applyShoppingActions(items, actions, options) {
  return actions
    .filter((action) => action.type.startsWith('shopping.'))
    .reduce((lines, action) => applyShoppingAction(lines, action, options), items)
}

// "3 uien", "uien 3" → { name: 'uien', count: 3 }; zonder getal aan het begin of eind
// count 1. Alleen een heel getal van 1 tot en met 99; verder geen eenheden.
export function parseLooseItem(text) {
  const words = String(text ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const asCount = (word) =>
    /^\d{1,2}$/.test(word ?? '') && Number(word) >= 1 ? Number(word) : null
  let count = null
  if (words.length > 1 && asCount(words[0]) != null) count = asCount(words.shift())
  else if (words.length > 1 && asCount(words.at(-1)) != null) count = asCount(words.pop())
  return { name: words.join(' '), count: count ?? 1 }
}
