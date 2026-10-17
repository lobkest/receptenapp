// "14 oktober 2026 om 20:15": een tijdstip van de server (ISO), in het Nederlands en in de
// tijdzone van de browser. Voor de beheerpagina's (verwijderverzoeken en versies).
export function formatDate(iso) {
  return new Date(iso).toLocaleString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
