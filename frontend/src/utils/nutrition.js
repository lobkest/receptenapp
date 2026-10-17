// Voedingswaarde op de receptpagina: de backend rekent (app/models/nutrition.rb), dit
// bestand rondt af en zet het in woorden.

// Dezelfde volgorde en sleutels als de API (NevoFood::NUTRIENTS).
export const NUTRIENTS = [
  { key: 'kcal', label: 'Energie', unit: 'kcal' },
  { key: 'protein', label: 'Eiwit', unit: 'g' },
  { key: 'carbohydrates', label: 'Koolhydraten', unit: 'g' },
  { key: 'fat', label: 'Vet', unit: 'g' },
  { key: 'fiber', label: 'Vezels', unit: 'g' },
]

const numberFormat = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 })

// Een schatting, dus grof afgerond: kcal vanaf 100 op tientallen, grammen vanaf 10 hele
// getallen en daaronder één decimaal. null (niemand weet het) blijft null.
export function roundNutrient(value, unit) {
  if (value == null) return null
  if (unit === 'kcal') return value >= 100 ? Math.round(value / 10) * 10 : Math.round(value)
  return value >= 10 ? Math.round(value) : Math.round(value * 10) / 10
}

// "± 830 kcal", "± 2,5 g", of "onbekend".
export function formatNutrient(value, unit) {
  const rounded = roundNutrient(value, unit)
  return rounded == null ? 'onbekend' : `± ${numberFormat.format(rounded)} ${unit}`
}

// Per portie verandert niet met de portiekiezer; het totaal wel: per portie × porties.
export function totalFor(perServing, servings) {
  return Object.fromEntries(
    Object.entries(perServing).map(([key, value]) => [
      key,
      value == null ? null : value * servings,
    ]),
  )
}

export function notCountedText(count) {
  return `Schatting; ${count} ${count === 1 ? 'ingrediënt' : 'ingrediënten'} niet meegeteld`
}

// De bronvermelding die NEVO voorschrijft; "en andere gegevens" als er etiketwaarden in zitten.
// Leeg als er alleen verwaarloosbare ingrediënten meetellen.
export function citation({ nevo_versions: versions, label_values: labelValues }) {
  if (!versions.length) return labelValues ? 'Gebaseerd op etiketgegevens.' : ''
  const extra = labelValues ? ' en andere gegevens' : ''
  return `Gebaseerd op gegevens van NEVO-online versie ${versions.join(', ')}, RIVM, Bilthoven${extra}.`
}

// De regels zoals ze nu gelden: een gewisselde regel (swaps: { regel-id: alternatief-id },
// zie utils/alternatives.js) rekent met zijn alternatief. swappedFrom: de naam van het origineel.
function activeLines(nutrition, swaps = {}) {
  return (nutrition.lines ?? []).map((line) => {
    const chosen = line.alternatives?.find((alternative) => alternative.id === swaps[line.id])
    return chosen ? { ...chosen, swappedFrom: line.name } : line
  })
}

function sum(values) {
  const known = values.filter((value) => value != null)
  return known.length ? known.reduce((total, value) => total + value, 0) : null
}

// Alles wat het blok toont, opgeteld uit de regels die de server per ingrediënt stuurt
// (app/models/nutrition.rb), met de gekozen alternatieven. Zonder wissels is het hetzelfde
// als wat de server zelf optelt (total, per_serving, not_counted, unknown).
export function summarize(nutrition, swaps = {}) {
  const lines = activeLines(nutrition, swaps)
  const counted = lines.filter((line) => line.values)
  const total = Object.fromEntries(
    NUTRIENTS.map(({ key }) => [key, sum(counted.map((line) => line.values[key]))]),
  )
  const unknown = Object.fromEntries(
    NUTRIENTS.map(({ key }) => [
      key,
      counted.filter((line) => line.values[key] == null).map((line) => line.name),
    ]).filter(([, names]) => names.length),
  )
  return {
    lines,
    total,
    per_serving: Object.fromEntries(
      Object.entries(total).map(([key, value]) => [
        key,
        value == null ? null : value / nutrition.servings,
      ]),
    ),
    not_counted: lines
      .filter((line) => line.reason)
      .map((line) => ({ name: line.name, reason: line.reason })),
    unknown,
    label_values: counted.some((line) => line.label),
    nevo_versions: [...new Set(counted.map((line) => line.nevo_version).filter(Boolean))],
  }
}

// "Per ingrediënt": voor het hele recept, geschaald met factor (gekozen / originele
// porties). Grootste kcal-bijdrage bovenaan; niet-meegetelde onderaan, in hun volgorde.
export function ingredientRows(lines, factor) {
  const scale = (value) => (value == null ? null : value * factor)
  const rows = lines.map((line, index) => ({
    ...line,
    key: `${line.id ?? 'extra'}-${index}`,
    grams: scale(line.grams),
    millilitres: scale(line.millilitres),
    values: line.values
      ? Object.fromEntries(Object.entries(line.values).map(([key, value]) => [key, scale(value)]))
      : null,
  }))
  const counted = rows
    .filter((row) => row.values)
    .sort((a, b) => (b.values.kcal ?? 0) - (a.values.kcal ?? 0))
  return [...counted, ...rows.filter((row) => !row.values)]
}

// "± 300 g", of "± 30 ml" voor iets zonder gram (een NEVO-product per 100 ml), of ''.
export function amountText(row) {
  if (row.grams != null) return formatNutrient(row.grams, 'g')
  if (row.millilitres != null) return formatNutrient(row.millilitres, 'ml')
  return ''
}

const SHORT_LABELS = {
  kcal: 'kcal',
  protein: 'eiwit',
  carbohydrates: 'koolh.',
  fat: 'vet',
  fiber: 'vezels',
}

// "330 kcal · 25 g eiwit · 0 g koolh. · 3 g vet · ? g vezels"
export function valuesText(values) {
  return NUTRIENTS.map(({ key, unit }) => {
    const rounded = roundNutrient(values[key], unit)
    const number = rounded == null ? '?' : numberFormat.format(rounded)
    return unit === 'kcal' ? `${number} kcal` : `${number} g ${SHORT_LABELS[key]}`
  }).join(' · ')
}
