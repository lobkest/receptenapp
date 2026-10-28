// "Delen" op de receptpagina: het recept als platte tekst, om in WhatsApp, een mail of
// notitie te plakken. Geen link: wie het krijgt, komt niet in de app. Wat je deelt is wat
// je ziet: het gekozen aantal porties en de gewisselde ingrediënten.
import { applySwaps } from '@/utils/alternatives'
import {
  NUTRIENTS,
  citation,
  formatNutrient,
  notCountedText,
  summarize,
  totalFor,
} from '@/utils/nutrition'
import { formatQuantity, scaleQuantity } from '@/utils/quantity'

function servingsText(servings) {
  return servings === 1 ? '1 portie' : `${servings} porties`
}

// "200 g tofu", of alleen "zout" zonder hoeveelheid. quantity is al geschaald.
function amountAndName(name, quantity, unit) {
  return quantity == null ? name : `${formatQuantity(quantity)} ${unit} ${name}`
}

// "- 200 g tofu (of: 250 g kip, tempeh) (optioneel)". Na een wissel staat het gekozen
// alternatief vooraan en het origineel tussen de andere keuzes.
function ingredientLine(row, factor) {
  const choices = [
    ...(row.original ? [row.original] : []),
    ...row.others.map((alternative) => ({
      name: alternative.name,
      quantity: alternative.effective_quantity,
      unit: alternative.effective_unit,
    })),
  ].map((choice) =>
    amountAndName(choice.name, scaleQuantity(choice.quantity, factor, choice.unit), choice.unit),
  )

  let text = `- ${amountAndName(row.name, scaleQuantity(row.quantity, factor, row.unit), row.unit)}`
  if (choices.length) text += ` (of: ${choices.join(', ')})`
  if (row.optional) text += ' (optioneel)'
  return text
}

// "Met kip" met daaronder wat eraf gaat, wat erbij komt en de notities.
function variationLines(variation, factor) {
  const lines = [variation.name]
  for (const change of variation.changes ?? []) {
    if (change.kind === 'remove') {
      lines.push(`- zonder ${change.name}`)
    } else {
      const quantity = scaleQuantity(change.quantity, factor, change.unit)
      lines.push(`- met ${amountAndName(change.name, quantity, change.unit)}`)
    }
  }
  if (variation.notes) lines.push(variation.notes)
  return lines
}

// "energie ± 520 kcal, eiwit ± 16 g, ..."
function nutrientsText(values) {
  return NUTRIENTS.map(
    ({ key, label, unit }) => `${label.toLowerCase()} ${formatNutrient(values[key], unit)}`,
  ).join(', ')
}

// Hetzelfde als het blok Voedingswaarde op de pagina (basisrecept); leeg als er niets meetelt.
function nutritionLines(recipe, servings, swaps) {
  if (!(recipe.nutrition?.counted > 0)) return []

  const nutrition = summarize(recipe.nutrition, swaps)
  const lines = [
    'Voedingswaarde (schatting)',
    `Per portie: ${nutrientsText(nutrition.per_serving)}`,
    `Totaal (${servingsText(servings)}): ${nutrientsText(totalFor(nutrition.per_serving, servings))}`,
  ]
  const notCounted = nutrition.not_counted
  if (notCounted.length) {
    const names = notCounted.map((line) => `${line.name} (${line.reason})`).join(', ')
    lines.push(`${notCountedText(notCounted.length)}: ${names}.`)
  }
  for (const { key, label } of NUTRIENTS) {
    const names = nutrition.unknown[key]
    if (names) lines.push(`${label} onbekend voor ${names.join(', ')}; niet meegeteld.`)
  }
  const source = citation(nutrition)
  if (source) lines.push(source)
  return lines
}

// recipe zoals de API het stuurt; servings het gekozen aantal; swaps { regel-id: alternatief-id }.
export function recipeText(recipe, { servings = recipe.servings, swaps = {} } = {}) {
  const factor = servings / recipe.servings
  const sections = [[recipe.title, servingsText(servings)]]

  if (recipe.description) sections.push([recipe.description.trim()])

  if (recipe.ingredients?.length) {
    sections.push([
      'Ingrediënten',
      ...applySwaps(recipe.ingredients, swaps).map((row) => ingredientLine(row, factor)),
    ])
  }

  if (recipe.steps?.length) {
    sections.push([
      'Bereiding',
      ...recipe.steps.map((step, index) => `${index + 1}. ${step.body.trim()}`),
    ])
  }

  if (recipe.variations?.length) {
    sections.push([
      'Variaties',
      ...recipe.variations.flatMap((variation, index) => [
        ...(index > 0 ? [''] : []),
        ...variationLines(variation, factor),
      ]),
    ])
  }

  const nutrition = nutritionLines(recipe, servings, swaps)
  if (nutrition.length) sections.push(nutrition)

  return sections.map((lines) => lines.join('\n')).join('\n\n')
}
