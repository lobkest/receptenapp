// Pure functies voor hoeveelheden: geen Vue, geen state, alleen invoer → uitvoer.
// Daardoor zijn ze makkelijk te testen en overal te hergebruiken.
//
// null betekent overal "naar smaak": dat schaalt niet mee en wordt niet afgerond.

// Bewust geen eetlepels of cups: alleen eenheden die je kunt optellen en schalen.
export const UNITS = ['g', 'ml', 'stuks']

// Kleinste waarde die we tonen als er wél iets nodig is; nooit afronden naar 0.
const MINIMUM = { g: 0.1, ml: 0.1, stuks: 0.5 }

// Rondt af op een "keukenwaardige" precisie per eenheid:
// - g/ml: vanaf 10 een heel getal (213,7 g → 214 g), daaronder één decimaal (2,25 ml → 2,3 ml).
//   Preciezer kun je thuis niet afmeten, maar bij kleine hoeveelheden telt die decimaal wel.
// - stuks: op 0,5 nauwkeurig (1,3 → 1,5); een half ei kan, een kwart niet.
// - onbekende eenheid: maximaal twee decimalen, als vangnet.
export function roundQuantity(value, unit) {
  if (value == null) return null
  if (value <= 0) return 0

  let rounded
  if (unit === 'g' || unit === 'ml') {
    rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10
  } else if (unit === 'stuks') {
    rounded = Math.round(value * 2) / 2
  } else {
    rounded = Math.round(value * 100) / 100
  }

  // 1 ei voor 4 personen, teruggeschaald naar 1 persoon, is 0,25 → 0,5 en niet 0.
  return Math.max(rounded, MINIMUM[unit] ?? 0.01)
}

// quantity × factor, daarna afgerond. "Naar smaak" (null) blijft null.
export function scaleQuantity(quantity, factor, unit) {
  if (quantity == null) return null
  return roundQuantity(Number(quantity) * factor, unit)
}

// Nederlandse notatie: 0,5 in plaats van 0.5, en 1.250 voor duizendtallen.
const numberFormat = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 2 })

export function formatQuantity(value) {
  return numberFormat.format(value)
}
