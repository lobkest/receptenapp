// Knipt een tekst in stukken: gewone tekst en links. "Kijk op https://x.nl." wordt
// [{ text: 'Kijk op ' }, { url: 'https://x.nl', text: 'https://x.nl' }, { text: '.' }].
// Alleen http(s) en www.: zo kan een tekst nooit een javascript:-link worden.
const LINK = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi

// Leestekens direct na een link horen bij de zin, niet bij de link ("zie https://x.nl.").
// Een sluithaakje alleen als er in de link geen openingshaakje staat (Wikipedia-links).
function trimTrailing(url) {
  let end = url.length
  while (end > 0) {
    const char = url[end - 1]
    if ('.,;:!?\'"'.includes(char)) end--
    else if (char === ')' && !url.slice(0, end).includes('(')) end--
    else break
  }
  return url.slice(0, end)
}

export function splitLinks(text) {
  const parts = []
  let last = 0
  for (const match of text.matchAll(LINK)) {
    const found = trimTrailing(match[0])
    if (match.index > last) parts.push({ text: text.slice(last, match.index) })
    const url = found.toLowerCase().startsWith('www.') ? `https://${found}` : found
    parts.push({ url, text: found })
    last = match.index + found.length
  }
  if (last < text.length) parts.push({ text: text.slice(last) })
  return parts
}
