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
export function citation({ nevo_versions: versions, label_values: labelValues }) {
  if (!versions.length) return 'Gebaseerd op etiketgegevens.'
  const extra = labelValues ? ' en andere gegevens' : ''
  return `Gebaseerd op gegevens van NEVO-online versie ${versions.join(', ')}, RIVM, Bilthoven${extra}.`
}

const SOURCES = { nevo: 'NEVO', etiket: 'etiket', 'nevo en etiket': 'NEVO en etiket' }

export function sourceLabel(source) {
  return SOURCES[source] ?? source
}
