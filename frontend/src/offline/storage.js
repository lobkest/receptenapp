// Veilige toegang tot localStorage. Die kan ontbreken of weigeren (privé-venster, opslag
// vol, uitgezet door de gebruiker): dan gooit elke aanroep een fout. Hier vangen we dat
// af en valt alles terug op een gewone Map in het geheugen. De app werkt dan nog, alleen
// is alles weg na herladen. Alleen voor kopieën: de database blijft de bron van waarheid.

const PREFIX = 'receptenapp:offline:'

// Alleen gebruikt als localStorage niet werkt.
const memory = new Map()

// Geeft de opgeslagen waarde terug, of null als er niets (bruikbaars) staat.
export function readJson(key) {
  let raw
  try {
    raw = localStorage.getItem(PREFIX + key)
  } catch {
    raw = memory.get(key) ?? null
  }
  if (raw == null) return null
  try {
    return JSON.parse(raw)
  } catch {
    // Kapotte data (bijv. half geschreven): alsof er niets stond.
    return null
  }
}

// Geeft true als het in localStorage staat, false als het alleen in het geheugen staat.
export function writeJson(key, value) {
  const raw = JSON.stringify(value)
  try {
    localStorage.setItem(PREFIX + key, raw)
    memory.delete(key)
    return true
  } catch {
    memory.set(key, raw)
    return false
  }
}

// Voor tests: het geheugen leeg, alsof de pagina opnieuw geladen is.
export function clearMemoryStorage() {
  memory.clear()
}
