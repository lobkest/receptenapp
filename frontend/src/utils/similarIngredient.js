// "Bedoel je: zoete aardappel?": een bestaand ingrediënt dat erg lijkt op wat je typt.
// Alleen een suggestie; de server maakt van elke nieuwe naam gewoon een nieuw ingrediënt.
//
// Lijkt erg: hetzelfde zonder accenten, spaties, streepjes of apostrofs ("chia zaad" →
// chiazaad, "creme fraiche" → crème fraîche), het enkelvoud van een meervoud ("zoete
// aardappelen", "blauwe bessen", "trostomaten") of een kleine typfout ("yohgurt").

// "Crème  Fraîche" → "cremefraiche"
export function compactName(name) {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\s'’.-]+/g, '')
}

// Zoals Ingredient#name op de server: spaties samengevoegd, kleine letters.
function plainName(name) {
  return String(name ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

// Mogelijke enkelvouden van een (samengedrukte) naam: tomaten → tomaat, bessen → bes,
// aardappelen → aardappel, eieren → ei, appels → appel.
function singulars(name) {
  const forms = new Set([name])
  for (const ending of ['eren', 'en', 's', 'n']) {
    if (!name.endsWith(ending) || name.length - ending.length < 2) continue
    const stem = name.slice(0, -ending.length)
    forms.add(stem)
    // Dubbele medeklinker eraf: bess → bes.
    if (/([^aeiou])\1$/.test(stem)) forms.add(stem.slice(0, -1))
    // Klinker verdubbelen voor de laatste medeklinker: tomat → tomaat.
    forms.add(stem.replace(/([^aeiou])([aeou])([^aeiou])$/, '$1$2$2$3'))
  }
  return forms
}

// Aantal bewerkingen (invoegen, weghalen, vervangen, twee letters omwisselen).
function distance(a, b) {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) rows[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1)
      }
    }
  }
  return rows[a.length][b.length]
}

// Hoeveel typfouten we nog "erg lijken" vinden: niets bij korte namen (ui ≠ ei).
function allowedTypos(length) {
  if (length >= 8) return 2
  if (length >= 4) return 1
  return 0
}

// De bestaande naam die het meest lijkt, of null. null ook als de naam zelf al bestaat.
export function similarIngredient(typed, names) {
  const plain = plainName(typed)
  const compact = compactName(typed)
  if (compact.length < 3 || names.includes(plain)) return null

  const forms = singulars(compact)
  let best = null
  let bestScore = Infinity
  for (const name of names) {
    const other = compactName(name)
    let score
    if (other === compact) score = 0
    else if (forms.has(other)) score = 0.5
    else {
      const typos = distance(compact, other)
      score = typos <= allowedTypos(Math.min(compact.length, other.length)) ? typos : Infinity
    }
    if (score < bestScore) {
      best = name
      bestScore = score
    }
  }
  return best
}
