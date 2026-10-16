import { computed, toValue } from 'vue'

// Verdeelt de veldfouten van de server (ApiError.errors uit src/api/client.js) over een
// formulier met regels, zoals RecipeForm (ingrediënten, stappen) en VariationForm (extra
// ingrediënten). De server noemt een regel naar zijn plek in de request:
// { "steps[1].body": ["moet opgegeven zijn"] }. keyOf vertaalt die plek naar de vaste key
// van de regel in het formulier, want lege regels gaan niet mee en regels kunnen
// verschoven zijn.
//
//   const { sortedErrors, isInvalid } = useServerErrors(() => props.errors, {
//     skip: (attribute) => ['title'].includes(attribute), // toont het formulier zelf
//     rowPattern: /^(?<list>steps)\[(?<index>\d+)\]\.(?<field>\w+)$/,
//     keyOf: ({ list, index }) => sentKeys.value[list][Number(index)],
//     labels: { body: 'Stap' },
//   })
//
// Een composable is een functie die reactieve staat (computed, ref) teruggeeft; elk
// component dat hem aanroept krijgt zijn eigen exemplaar. Vergelijk met een hulpklasse.
//
// labels: { body: 'Stap' }, of een functie (field) => label voor velden met een eigen
// vorm, zoals "alternatives[1].quantity" in RecipeForm.
export function useServerErrors(errors, { skip = () => false, rowPattern, keyOf, labels = {} }) {
  const label = (field) => (typeof labels === 'function' ? labels(field) : labels[field]) ?? field

  // byRow: meldingen per regel (key); invalid: per regel welke velden fout zijn (voor de
  // rode rand, aria-invalid); general: de rest, bovenaan het formulier.
  const sortedErrors = computed(() => {
    const byRow = {}
    const invalid = {}
    const general = []

    for (const [attribute, messages] of Object.entries(toValue(errors))) {
      if (skip(attribute)) continue

      const match = attribute.match(rowPattern)
      const key = match && keyOf(match.groups)
      if (key) {
        const { field } = match.groups
        byRow[key] ??= []
        byRow[key].push(`${label(field)} ${messages.join(', ')}`)
        invalid[key] ??= {}
        invalid[key][field] = true
      } else if (attribute === 'base') {
        general.push(...messages)
      } else {
        general.push(`${label(attribute)} ${messages.join(', ')}`)
      }
    }

    return { byRow, invalid, general }
  })

  function isInvalid(row, field) {
    return !!sortedErrors.value.invalid[row.key]?.[field]
  }

  return { sortedErrors, isInvalid }
}

// De fouten onder een voorvoegsel, zonder dat voorvoegsel: van een recept met een
// variatie gaan { "variations[0].name": [...] } als { name: [...] } naar het variatieformulier.
export function errorsUnder(errors, prefix) {
  return Object.fromEntries(
    Object.entries(errors)
      .filter(([attribute]) => attribute.startsWith(prefix))
      .map(([attribute, messages]) => [attribute.slice(prefix.length), messages]),
  )
}
