import { updateIngredientTraits } from '@/api/ingredients'

// Kenmerken gaan bij elke klik meteen naar de server, zonder lock_version: de laatste wint.
// Per ingrediënt gaat er één verzoek tegelijk, in volgorde, zodat een trage eerdere klik
// een latere niet overschrijft. save() geeft { result, latest }: latest is false als er
// intussen een nieuwere klik is, dan laat je het scherm zoals het is.
export function useTraitSaver() {
  const queues = new Map()
  const counters = new Map()

  async function save(id, fields) {
    const number = (counters.get(id) ?? 0) + 1
    counters.set(id, number)
    const run = (queues.get(id) ?? Promise.resolve())
      .catch(() => {})
      .then(() => updateIngredientTraits(id, fields))
    queues.set(id, run)
    const result = await run
    return { result, latest: counters.get(id) === number }
  }

  return { save }
}
