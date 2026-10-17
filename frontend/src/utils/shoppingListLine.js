import { formatQuantity } from '@/utils/quantity'

// Herkomst van een regel die alleen van de standaardlijst komt (zonder recept).
export const STANDARD_SOURCE = 'standaard'

// Komt deze regel alleen van de standaardlijst (geen recept, dus ook geen hoeveelheid)?
export function isStandardOnly(item) {
  return item.recipe_id == null && item.source_label === STANDARD_SOURCE
}

// De tekst van een regel op de boodschappenlijst.
//   alleen standaardlijst:        "melk", vanaf 2 keer "melk ×2"
//   met hoeveelheid:              "200 ml melk"; zonder ("naar smaak"): "zout"
//   ook van de standaardlijst:    "200 ml melk +1", zodat je ziet dat het geen 400 ml is
export function shoppingListLine(item) {
  const count = item.standard_count ?? 0
  // Een standaardregel heeft normaal geen hoeveelheid; staat er (via de API) toch een, dan
  // tonen we die liever dan hem stil weg te laten.
  const base =
    item.quantity == null ? item.name : `${formatQuantity(item.quantity)} ${item.unit} ${item.name}`
  if (isStandardOnly(item)) return count >= 2 ? `${base} ×${count}` : base
  return count > 0 ? `${base} +${count}` : base
}

// "uit: …" onder de regel: de herkomst, en ", standaard" als er van de standaardlijst
// bij is geteld. Null als er niets te melden is.
export function shoppingListSource(item) {
  if (isStandardOnly(item) || !item.standard_count) return item.source_label ?? null
  return item.source_label ? `${item.source_label}, ${STANDARD_SOURCE}` : STANDARD_SOURCE
}
