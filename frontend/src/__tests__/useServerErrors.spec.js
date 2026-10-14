import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { errorsUnder, useServerErrors } from '../composables/useServerErrors'

describe('useServerErrors', () => {
  const rowPattern = /^(?<list>steps)\[(?<index>\d+)\]\.(?<field>\w+)$/
  // Plek 0 in de request is de regel met key 7, plek 1 die met key 9.
  const sentKeys = { steps: [7, 9] }
  const keyOf = ({ list, index }) => sentKeys[list][Number(index)]

  function setup(errors, extra = {}) {
    return useServerErrors(errors, { rowPattern, keyOf, labels: { body: 'Stap' }, ...extra })
  }

  it('zet een regelfout bij de key van die regel, met het label ervoor', () => {
    const { sortedErrors, isInvalid } = setup(() => ({ 'steps[1].body': ['moet opgegeven zijn'] }))

    expect(sortedErrors.value.byRow).toEqual({ 9: ['Stap moet opgegeven zijn'] })
    expect(isInvalid({ key: 9 }, 'body')).toBe(true)
    expect(isInvalid({ key: 7 }, 'body')).toBe(false)
    expect(sortedErrors.value.general).toEqual([])
  })

  it('zet base zonder label en de rest met label bovenaan', () => {
    const { sortedErrors } = setup(() => ({
      base: ['Te veel regels'],
      steps: ['moet opgegeven zijn'],
    }))

    expect(sortedErrors.value.general).toEqual(['Te veel regels', 'steps moet opgegeven zijn'])
  })

  it('slaat velden over die het formulier zelf toont', () => {
    const { sortedErrors } = setup(() => ({ title: ['moet opgegeven zijn'] }), {
      skip: (attribute) => attribute === 'title',
    })

    expect(sortedErrors.value.general).toEqual([])
  })

  it('een regel die niet (meer) bestaat komt bovenaan', () => {
    const { sortedErrors } = setup(() => ({ 'steps[5].body': ['is te lang'] }))

    expect(sortedErrors.value.general).toEqual(['steps[5].body is te lang'])
  })

  it('reageert op nieuwe fouten (reactief)', () => {
    const errors = ref({})
    const { sortedErrors } = setup(errors)
    expect(sortedErrors.value.byRow).toEqual({})

    errors.value = { 'steps[0].body': ['is te lang'] }

    expect(sortedErrors.value.byRow).toEqual({ 7: ['Stap is te lang'] })
  })
})

describe('errorsUnder', () => {
  it('geeft de fouten onder een voorvoegsel, zonder dat voorvoegsel', () => {
    expect(errorsUnder({ 'variations[0].name': ['x'], title: ['y'] }, 'variations[0].')).toEqual({
      name: ['x'],
    })
  })
})
