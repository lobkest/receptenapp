// "Tijdelijk": een los item van de boodschappenlijst dat de server op de standaardlijst
// zette (StandardItem.note_used!). Geen categorie maar een eigen kenmerk:
// temporary_last_used_at (null = permanent). De kop staat altijd als laatste.
export const TEMPORARY_NAME = 'Tijdelijk'
// Zoals StandardItem::TEMPORARY_LIFETIME: na 2 maanden niet gebruikt is het weg.
export const TEMPORARY_MONTHS = 2

export function isTemporary(item) {
  return item.temporary_last_used_at != null
}

// now min TEMPORARY_MONTHS kalendermaanden, zoals Rails' 2.months.ago: op 30 april is dat
// 28 (of 29) februari, niet 2 maart zoals setMonth alleen zou geven.
export function expiryLimit(now = Date.now()) {
  const limit = new Date(now)
  const day = limit.getDate()
  limit.setDate(1)
  limit.setMonth(limit.getMonth() - TEMPORARY_MONTHS)
  const daysInMonth = new Date(limit.getFullYear(), limit.getMonth() + 1, 0).getDate()
  limit.setDate(Math.min(day, daysInMonth))
  return limit.getTime()
}

// Verlopen: langer dan TEMPORARY_MONTHS niet gebruikt. De server verwijdert ze bij het
// ophalen; de offline kopie (IndexedDB) kan ze nog hebben, dus filteren we ze hier ook weg.
export function isExpired(item, now = Date.now()) {
  if (!isTemporary(item)) return false
  return new Date(item.temporary_last_used_at).getTime() < expiryLimit(now)
}
