// Kenmerken van een ingrediënt (vlees, vis, dierlijk, gluten, lactose, noten) en wat ze betekenen
// voor de automatische tags. traits: zoals /api/traits ze geeft, in vaste volgorde:
// [{ name: 'vlees', excluded_by: ['vegetarisch'] }, ...].

// "niet vegetarisch, niet veganistisch" voor kip, of "past bij alle automatische tags".
// In de volgorde van de kenmerken, elke tag één keer.
export function traitConsequence(selected, traits) {
  const excluded = traits
    .filter((trait) => selected.includes(trait.name))
    .flatMap((trait) => trait.excluded_by)
  const unique = [...new Set(excluded)]
  return unique.length
    ? unique.map((tag) => `niet ${tag}`).join(', ')
    : 'past bij alle automatische tags'
}

// Kenmerk aan of uit; het resultaat in de volgorde van traits, zoals de server het geeft.
export function toggleTrait(selected, name, traits) {
  const next = selected.includes(name)
    ? selected.filter((other) => other !== name)
    : [...selected, name]
  return traits.map((trait) => trait.name).filter((other) => next.includes(other))
}

// "vegetarisch, veganistisch, glutenvrij, lactosevrij en notenvrij": alle automatische
// tags, in de volgorde van de kenmerken, elke tag één keer. Leeg als er geen zijn.
export function automaticTagList(traits) {
  const tags = [...new Set(traits.flatMap((trait) => trait.excluded_by))]
  if (tags.length < 2) return tags.join('')
  return `${tags.slice(0, -1).join(', ')} en ${tags.at(-1)}`
}
