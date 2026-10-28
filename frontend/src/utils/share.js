// Tekst delen: op een telefoon (en Chrome/Edge op Windows) het deelmenu van het systeem,
// met WhatsApp, mail, "Kopiëren", ...; waar dat niet bestaat (Firefox, Chrome op Linux)
// meteen naar het klembord. Beide werken alleen via https of localhost.
//
// Geeft 'shared', 'copied' of 'cancelled' (deelmenu weggeklikt) terug; gooit een Error als
// ook kopiëren niet lukt.
export async function shareText(title, text) {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text })
      return 'shared'
    } catch (e) {
      // Weggeklikt: niets aan de hand. Anders (geweigerd, te lang, ...) toch kopiëren.
      if (e?.name === 'AbortError') return 'cancelled'
    }
  }

  try {
    await navigator.clipboard.writeText(text)
    return 'copied'
  } catch {
    throw new Error('Delen en kopiëren lukken niet in deze browser.')
  }
}
