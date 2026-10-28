import { formatQuantity } from '@/utils/quantity'

// Herkomst van een regel die alleen van de standaardlijst komt (zonder recept).
export const STANDARD_SOURCE = 'standaard'

// Komt deze regel alleen van de standaardlijst (geen recept, dus ook geen hoeveelheid)?
export function isStandardOnly(item) {
  return item.recipe_id == null && item.source_label === STANDARD_SOURCE
}

// Het aantal van een regel (de stepper): 1 tot en met 99. Een offline kopie van vóór het
// aantal heeft er geen; die telt als 1.
export const MAX_COUNT = 99

export function countOf(item) {
  return item.count ?? 1
}

// De tekst van een regel op de boodschappenlijst. Het aantal staat in de stepper ernaast,
// dus niet nog eens in de tekst; alleen bij een hoeveelheid vermenigvuldigt het:
//   zonder hoeveelheid:  "melk" (ook "zout", naar smaak uit een recept)
//   met hoeveelheid:     "100 g yoghurt", bij aantal 2 "200 g yoghurt (×2)"
// Een standaardregel heeft normaal geen hoeveelheid; staat er (via de API) toch een, dan
// tonen we die liever dan hem stil weg te laten.
export function shoppingListLine(item) {
  if (item.quantity == null) return item.name
  const count = countOf(item)
  const total = `${formatQuantity(item.quantity * count)} ${item.unit} ${item.name}`
  return count >= 2 ? `${total} (×${count})` : total
}

// "uit: …" onder de regel: de herkomst, en ", standaard" als er van de standaardlijst
// bij is geteld. Null als er niets te melden is.
export function shoppingListSource(item) {
  if (isStandardOnly(item) || !item.standard_count) return item.source_label ?? null
  return item.source_label ? `${item.source_label}, ${STANDARD_SOURCE}` : STANDARD_SOURCE
}
