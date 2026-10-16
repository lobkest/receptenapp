import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createActionQueue, formatSavedAt, loadSnapshot, saveSnapshot } from '../offline'
import { clearMemoryStorage, readJson, writeJson } from '../offline/storage'
import { ApiError } from '../api/client'

// Alsof localStorage uitgezet is (of vol): elke aanroep gooit.
function breakStorage() {
  for (const method of ['getItem', 'setItem', 'removeItem']) {
    vi.spyOn(Storage.prototype, method).mockImplementation(() => {
      throw new DOMException('Opslag uitgezet', 'SecurityError')
    })
  }
}

function newQueue() {
  return createActionQueue('test', { idOf: (action) => action.item_id })
}

describe('offline-module', () => {
  beforeEach(() => {
    localStorage.clear()
    clearMemoryStorage()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('snapshot', () => {
    it('bewaart data met tijdstempel in localStorage, onder een eigen voorvoegsel', () => {
      saveSnapshot('lijst', [{ id: 1 }], 1_700_000_000_000)

      expect(loadSnapshot('lijst')).toEqual({ savedAt: 1_700_000_000_000, data: [{ id: 1 }] })
      expect(Object.keys(localStorage)).toEqual(['receptenapp:offline:lijst:snapshot'])
    })

    it('gebruikt nu als tijdstempel als je er geen meegeeft', () => {
      vi.spyOn(Date, 'now').mockReturnValue(42)
      saveSnapshot('lijst', [])

      expect(loadSnapshot('lijst').savedAt).toBe(42)
    })

    it('geeft null zonder snapshot, of bij kapotte data', () => {
      expect(loadSnapshot('lijst')).toBeNull()

      localStorage.setItem('receptenapp:offline:lijst:snapshot', '{kapot')
      expect(loadSnapshot('lijst')).toBeNull()

      localStorage.setItem('receptenapp:offline:lijst:snapshot', JSON.stringify({ data: [] }))
      expect(loadSnapshot('lijst')).toBeNull()
    })
  })

  describe('wachtrij', () => {
    it('voegt acties voor hetzelfde item samen: de laatste wint', () => {
      const queue = newQueue()

      queue.enqueue({ item_id: 1, checked: true, at: 'a' })
      queue.enqueue({ item_id: 2, checked: true, at: 'b' })
      queue.enqueue({ item_id: 1, checked: false, at: 'c' })

      expect(queue.all()).toEqual([
        { item_id: 2, checked: true, at: 'b' },
        { item_id: 1, checked: false, at: 'c' },
      ])
      expect(queue.size).toBe(2)
    })

    it('blijft bewaard: een nieuwe wachtrij met dezelfde sleutel ziet dezelfde acties', () => {
      newQueue().enqueue({ item_id: 1, checked: true, at: 'a' })

      expect(newQueue().all()).toEqual([{ item_id: 1, checked: true, at: 'a' }])
    })

    it('kan de acties van één item weggooien', () => {
      const queue = newQueue()
      queue.enqueue({ item_id: 1, checked: true, at: 'a' })
      queue.enqueue({ item_id: 2, checked: true, at: 'b' })

      queue.discard(1)

      expect(queue.all().map((a) => a.item_id)).toEqual([2])
    })

    it('verstuurt alles in volgorde en is daarna leeg', async () => {
      const queue = newQueue()
      queue.enqueue({ item_id: 1, checked: true, at: 'a' })
      queue.enqueue({ item_id: 2, checked: false, at: 'b' })
      const send = vi.fn().mockResolvedValue({})

      expect(await queue.flush(send)).toEqual({ sent: 2, skipped: 0 })

      expect(send.mock.calls.map(([a]) => [a.item_id, a.checked])).toEqual([
        [1, true],
        [2, false],
      ])
      expect(queue.size).toBe(0)
    })

    it('slaat een 404 over (regel bestaat niet meer) en gaat door met de rest', async () => {
      const queue = newQueue()
      queue.enqueue({ item_id: 1, checked: true, at: 'a' })
      queue.enqueue({ item_id: 2, checked: true, at: 'b' })
      const send = vi.fn(async (action) => {
        if (action.item_id === 1) throw new ApiError('not_found', 'Niet gevonden.')
        return {}
      })

      expect(await queue.flush(send)).toEqual({ sent: 1, skipped: 1 })
      expect(send).toHaveBeenCalledTimes(2)
      expect(queue.size).toBe(0)
    })

    it('stopt zonder netwerk en houdt wat nog niet verstuurd is', async () => {
      const queue = newQueue()
      queue.enqueue({ item_id: 1, checked: true, at: 'a' })
      queue.enqueue({ item_id: 2, checked: true, at: 'b' })
      const send = vi
        .fn()
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new ApiError('network', 'Kan de server niet bereiken.'))

      await expect(queue.flush(send)).rejects.toMatchObject({ kind: 'network' })

      expect(queue.all().map((a) => a.item_id)).toEqual([2])
    })

    it('houdt een nieuwere actie die binnenkomt terwijl de oude onderweg is', async () => {
      const queue = newQueue()
      queue.enqueue({ item_id: 1, checked: true, at: 'a' })
      const send = vi.fn(async () => {
        queue.enqueue({ item_id: 1, checked: false, at: 'b' })
      })

      await queue.flush(send)

      expect(queue.all()).toEqual([{ item_id: 1, checked: false, at: 'b' }])
    })

    it('verstuurt niet dubbel als twee plekken tegelijk flushen', async () => {
      const queue = newQueue()
      queue.enqueue({ item_id: 1, checked: true, at: 'a' })
      const send = vi.fn().mockResolvedValue({})

      await Promise.all([queue.flush(send), queue.flush(send)])

      expect(send).toHaveBeenCalledTimes(1)
    })

    it('negeert kapotte data in de opslag', () => {
      localStorage.setItem('receptenapp:offline:test:queue', '{"geen":"lijst"}')

      expect(newQueue().all()).toEqual([])
    })
  })

  describe('zonder localStorage', () => {
    it('gooit nooit, en onthoudt snapshot en wachtrij in het geheugen', async () => {
      breakStorage()
      const queue = newQueue()

      expect(saveSnapshot('lijst', [{ id: 1 }], 5)).toBe(false)
      expect(loadSnapshot('lijst')).toEqual({ savedAt: 5, data: [{ id: 1 }] })

      queue.enqueue({ item_id: 1, checked: true, at: 'a' })
      expect(queue.all()).toHaveLength(1)
      await queue.flush(vi.fn().mockResolvedValue({}))
      expect(queue.size).toBe(0)
    })

    it('leest gewoon null als localStorage weigert en er niets in het geheugen staat', () => {
      breakStorage()

      expect(readJson('iets')).toBeNull()
      expect(writeJson('iets', 1)).toBe(false)
      expect(readJson('iets')).toBe(1)
    })
  })

  it('schrijft het tijdstip als HH:MM', () => {
    expect(formatSavedAt(new Date(2026, 9, 16, 9, 5).getTime())).toBe('09:05')
    expect(formatSavedAt(new Date(2026, 9, 16, 14, 30).getTime())).toBe('14:30')
  })
})
