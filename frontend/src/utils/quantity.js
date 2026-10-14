// Pure functies voor hoeveelheden: geen Vue, geen state, alleen invoer → uitvoer.
// Daardoor zijn ze makkelijk te testen en overal te hergebruiken.
//
// null betekent overal "naar smaak": dat schaalt niet mee en wordt niet afgerond.

// Bewust geen eetlepels of cups: alleen eenheden die je kunt optellen en schalen.
export const UNITS = ['g', 'ml', 'stuks']

// Kleinste waarde die we tonen als er wél iets nodig is; nooit afronden naar 0.
const MINIMUM = { g: 0.1, ml: 0.1, stuks: 0.5 }

// Rondt af op decimals cijfers achter de komma, half naar boven, zonder float-ruis.
// 0,35 × 3 is in JavaScript 1,0499999999999998; Math.round(10,499…) zou 1,0 geven.
// Daarom eerst terug naar 12 significante cijfers (1,05), en dan afronden via de
// e-notatie ("1.05e1" is precies 10,5), niet via × 10. Zo rekent het net als BigDecimal
// op de server (app/models/quantity.rb).
function roundTo(value, decimals) {
  const clean = Number(value.toPrecision(12))
  return Number(`${Math.round(Number(`${clean}e${decimals}`))}e-${decimals}`)
}

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
    rounded = value >= 10 ? roundTo(value, 0) : roundTo(value, 1)
  } else if (unit === 'stuks') {
    rounded = roundTo(value * 2, 0) / 2
  } else {
    rounded = roundTo(value, 2)
  }

  // 1 ei voor 4 personen, teruggeschaald naar 1 persoon, is 0,25 → 0,5 en niet 0.
  return Math.max(rounded, MINIMUM[unit] ?? 0.01)
}

// quantity × factor, daarna afgerond. "Naar smaak" (null) blijft null.
export function scaleQuantity(quantity, factor, unit) {
  if (quantity == null) return null
  return roundQuantity(Number(quantity) * factor, unit)
}

// Voor een invoerveld: getallen staan in formulieren als tekst, precies zoals je ze typt
// ("1,5"), en gaan zo naar de server. Die zet de komma om en meldt "abc" als fout;
// type="number" zou "1,5" in sommige browsers stilletjes leeg laten. Van de API: 0.5 → "0,5".
export function numberText(value) {
  return value == null ? '' : String(value).replace('.', ',')
}

// Nederlandse notatie: 0,5 in plaats van 0.5, en 1.250 voor duizendtallen.
const numberFormat = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 2 })

export function formatQuantity(value) {
  return numberFormat.format(value)
}
