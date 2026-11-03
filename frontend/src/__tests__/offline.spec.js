import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { clear, createStore, get } from 'idb-keyval'
import { createOutbox, initOffline, loadSnapshot, saveSnapshot } from '../offline'
import { clearMemoryStorage, initStorage, readJson, writeJson } from '../offline/storage'
import { ApiError } from '../api/client'

// fake-indexeddb: een IndexedDB in het geheugen van de test, zoals de browser er een heeft.
const idb = createStore('receptenapp', 'offline')

// Alsof de pagina opnieuw geladen is: het geheugen leeg, en alles opnieuw uit IndexedDB.
async function reload() {
  clearMemoryStorage()
  await initStorage()
}

function action(fields) {
  return { type: 'test.set', kind: 'set', target: 'item:1', payload: {}, ...fields }
}

function summary(outbox) {
  return outbox.all().map(({ type, kind, target, payload }) => ({ type, kind, target, payload }))
}

describe('offline-module', () => {
  beforeEach(async () => {
    localStorage.clear()
    await clear(idb)
    await reload()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('opslag (IndexedDB met een kopie in het geheugen)', () => {
    it('leest meteen terug, en na herladen uit IndexedDB', async () => {
      await writeJson('lijst', { a: 1 })
      expect(readJson('lijst')).toEqual({ a: 1 })

      await reload()
      expect(readJson('lijst')).toEqual({ a: 1 })
      expect(await get('lijst', idb)).toBe('{"a":1}')
    })

    it('geeft elke keer een eigen kopie: aanpassen verandert de opgeslagen versie niet', async () => {
      await writeJson('lijst', [{ checked: false }])
      readJson('lijst')[0].checked = true

      expect(readJson('lijst')).toEqual([{ checked: false }])
    })

    it('vraagt bij de eerste keer opslaan om blijvende opslag, en gooit niet als dat geweigerd wordt', async () => {
      const persist = vi.fn().mockRejectedValue(new Error('nee'))
      vi.stubGlobal('navigator', { ...navigator, storage: { persist } })

      await writeJson('a', 1)
      await writeJson('b', 2)

      expect(persist).toHaveBeenCalledTimes(1)
      vi.unstubAllGlobals()
    })

    it('geeft null bij kapotte data', async () => {
      localStorage.setItem('receptenapp:offline:kapot', '{kapot')
      await reload()

      expect(readJson('kapot')).toBeNull()
    })
  })

  describe('van localStorage naar IndexedDB', () => {
    it('zet de oude sleutels over en ruimt ze daarna op', async () => {
      const snapshot = { savedAt: 1_000, data: [{ id: 1, name: 'bloem' }] }
      localStorage.setItem('receptenapp:offline:shoppingList:snapshot', JSON.stringify(snapshot))
      localStorage.setItem('ander:ding', 'blijft')

      await reload()

      expect(loadSnapshot('shoppingList')).toEqual(snapshot)
      expect(await get('shoppingList:snapshot', idb)).toBe(JSON.stringify(snapshot))
      expect(Object.keys(localStorage)).toEqual(['ander:ding'])
    })

    it('laat een nieuwere waarde in IndexedDB winnen van de oude in localStorage', async () => {
      await writeJson('shoppingList:snapshot', { savedAt: 2_000, data: [] })
      localStorage.setItem(
        'receptenapp:offline:shoppingList:snapshot',
        JSON.stringify({ savedAt: 1_000, data: [] }),
      )

      await reload()

      expect(loadSnapshot('shoppingList').savedAt).toBe(2_000)
      expect(localStorage.length).toBe(0)
    })

    it('zet de oude wachtrij (afvinken) om naar de outbox, met dezelfde volgorde', async () => {
      localStorage.setItem(
        'receptenapp:offline:shoppingList:queue',
        JSON.stringify([
          { item_id: 2, checked: true, at: '2026-11-01T10:00:00.000Z' },
          { item_id: 1, checked: false, at: '2026-11-01T10:01:00.000Z' },
          { geen: 'actie' },
        ]),
      )
      clearMemoryStorage()

      await initOffline()

      expect(summary(createOutbox('outbox'))).toEqual([
        { type: 'shopping.check', kind: 'set', target: 'shopping:2', payload: { checked: true } },
        { type: 'shopping.check', kind: 'set', target: 'shopping:1', payload: { checked: false } },
      ])
      expect(readJson('shoppingList:queue')).toBeNull()
      expect(localStorage.length).toBe(0)
      // Na nog een keer herladen niet dubbel.
      await reload()
      await initOffline()
      expect(createOutbox('outbox').size).toBe(2)
    })

    it('zonder IndexedDB blijft localStorage staan, en is alles in het geheugen te lezen', async () => {
      const original = globalThis.indexedDB
      vi.stubGlobal('indexedDB', undefined)
      localStorage.setItem(
        'receptenapp:offline:lijst:snapshot',
        JSON.stringify({ savedAt: 1, data: [] }),
      )

      await reload()

      expect(loadSnapshot('lijst')).toEqual({ savedAt: 1, data: [] })
      expect(localStorage.length).toBe(1)
      expect(await writeJson('x', 1)).toBe(false)
      expect(readJson('x')).toBe(1)
      vi.stubGlobal('indexedDB', original)
      vi.unstubAllGlobals()
    })
  })

  describe('snapshot', () => {
    it('bewaart data met tijdstempel en extra velden (zoals de ETag)', async () => {
      await saveSnapshot('lijst', [1, 2], 1_000, { etag: 'W/"abc"' })
      await reload()

      expect(loadSnapshot('lijst')).toEqual({ savedAt: 1_000, data: [1, 2], etag: 'W/"abc"' })
    })

    it('geeft null zonder geldige snapshot', async () => {
      expect(loadSnapshot('lijst')).toBeNull()
      await writeJson('lijst:snapshot', { data: [] })
      expect(loadSnapshot('lijst')).toBeNull()
    })
  })

  describe('outbox: samenvoegen', () => {
    it('een waarde zetten: de laatste wint en komt achteraan', () => {
      const outbox = createOutbox('test')
      outbox.enqueue(action({ target: 'item:1', payload: { checked: true } }))
      outbox.enqueue(action({ target: 'item:2', payload: { checked: true } }))
      expect(outbox.enqueue(action({ target: 'item:1', payload: { checked: false } }))).toBe(
        'merged',
      )

      expect(summary(outbox).map((a) => [a.target, a.payload])).toEqual([
        ['item:2', { checked: true }],
        ['item:1', { checked: false }],
      ])
    })

    it('verschillende soorten waarden voor hetzelfde ding blijven allebei staan', () => {
      const outbox = createOutbox('test')
      outbox.enqueue(action({ type: 'test.check', payload: { checked: true } }))
      outbox.enqueue(action({ type: 'test.count', payload: { count: 3 } }))

      expect(outbox.size).toBe(2)
    })

    it('een waarde voor iets dat offline is aangemaakt, gaat in die create', () => {
      const outbox = createOutbox('test')
      outbox.enqueue({
        type: 'test.create',
        kind: 'create',
        target: 'item:tmp:a',
        payload: { name: 'melk' },
      })

      expect(outbox.enqueue(action({ target: 'item:tmp:a', payload: { name: 'karnemelk' } }))).toBe(
        'merged',
      )
      expect(summary(outbox)).toEqual([
        {
          type: 'test.create',
          kind: 'create',
          target: 'item:tmp:a',
          payload: { name: 'karnemelk' },
        },
      ])
    })

    it('aanmaken en weer weghalen: beide vallen weg, ook wat er tussendoor kwam', () => {
      const outbox = createOutbox('test')
      outbox.enqueue({ type: 'test.create', kind: 'create', target: 'item:tmp:a', payload: {} })
      outbox.enqueue(action({ target: 'item:2', payload: { checked: true } }))
      outbox.enqueue({ type: 'test.call', kind: 'call', target: 'item:tmp:b', payload: {} })

      expect(outbox.enqueue({ type: 'test.delete', kind: 'delete', target: 'item:tmp:a' })).toBe(
        'cancelled',
      )
      expect(outbox.enqueue({ type: 'test.delete', kind: 'delete', target: 'item:tmp:b' })).toBe(
        'cancelled',
      )
      expect(summary(outbox).map((a) => a.target)).toEqual(['item:2'])
    })

    it('weghalen van iets van de server: de waarden ervoor vallen weg, de delete komt achteraan', () => {
      const outbox = createOutbox('test')
      outbox.enqueue(action({ target: 'item:1', payload: { checked: true } }))
      outbox.enqueue({ type: 'test.call', kind: 'call', payload: {} })
      outbox.enqueue({ type: 'test.delete', kind: 'delete', target: 'item:1' })

      expect(summary(outbox).map((a) => a.kind)).toEqual(['call', 'delete'])
    })

    it('geeft elke actie een uuid en een tijdstip, en blijft bewaard na herladen', async () => {
      createOutbox('test').enqueue(action({}))
      await reload()

      const [stored] = createOutbox('test').all()
      expect(stored.id).toMatch(/^[0-9a-f-]{36}$/)
      expect(stored.at).toEqual(expect.any(String))
    })

    it('negeert kapotte data in de opslag', async () => {
      await writeJson('test', { actions: 'geen lijst' })
      expect(createOutbox('test').all()).toEqual([])
    })
  })

  describe('outbox: versturen', () => {
    it('verstuurt in volgorde, met de server-id van het target, en is daarna leeg', async () => {
      const outbox = createOutbox('test')
      outbox.enqueue(action({ target: 'item:12', payload: { n: 1 } }))
      outbox.enqueue({ type: 'test.call', kind: 'call', payload: { n: 2 } })
      const sent = []

      const result = await outbox.flush(async (a, { id }) => sent.push([a.payload.n, id]))

      expect(sent).toEqual([
        [1, 12],
        [2, null],
      ])
      expect(result).toEqual({ sent: 2, skipped: 0, dropped: [] })
      expect(outbox.size).toBe(0)
    })

    it('na een create weten de acties erna welk id het werd', async () => {
      const outbox = createOutbox('test')
      outbox.enqueue({ type: 'test.create', kind: 'create', target: 'item:tmp:a', payload: {} })
      const ids = []
      const send = async (a, { id }) => {
        ids.push([a.kind, id])
        if (a.kind === 'create') {
          // Terwijl de create onderweg is: een waarde voor hetzelfde ding. Die mag niet meer
          // in de create (het request is al weg), maar komt erachter.
          outbox.enqueue(action({ target: 'item:tmp:a', payload: { checked: true } }))
          return { id: 41 }
        }
        return null
      }

      await outbox.flush(send)

      expect(ids).toEqual([
        ['create', null],
        ['set', 41],
      ])
    })

    it('slaat een 404 over en gaat door met de rest', async () => {
      const outbox = createOutbox('test')
      outbox.enqueue(action({ target: 'item:1' }))
      outbox.enqueue(action({ target: 'item:2' }))
      const send = vi.fn(async (a) => {
        if (a.target === 'item:1') throw new ApiError('not_found', 'Niet gevonden.')
      })

      const result = await outbox.flush(send)

      expect(send).toHaveBeenCalledTimes(2)
      expect(result).toMatchObject({ sent: 1, skipped: 1 })
      expect(outbox.size).toBe(0)
    })

    it('laat een 422 vallen en geeft hem door voor één melding', async () => {
      const outbox = createOutbox('test')
      outbox.enqueue({ type: 'test.create', kind: 'create', target: 'item:tmp:a', payload: {} })
      outbox.enqueue(action({ target: 'item:2' }))
      const refused = new ApiError('validation', 'Naam is al in gebruik')
      const send = vi.fn(async (a) => {
        if (a.kind === 'create') throw refused
      })

      const result = await outbox.flush(send)

      expect(result.dropped).toEqual([
        { action: expect.objectContaining({ kind: 'create' }), error: refused },
      ])
      expect(result.sent).toBe(1)
      expect(outbox.size).toBe(0)
    })

    it('slaat een actie over op iets waarvan de create wegviel', async () => {
      const outbox = createOutbox('test')
      await writeJson('test', {
        actions: [{ id: 'x', type: 'test.set', kind: 'set', target: 'item:tmp:weg', payload: {} }],
        ids: {},
      })
      const send = vi.fn()

      const result = await outbox.flush(send)

      expect(send).not.toHaveBeenCalled()
      expect(result.skipped).toBe(1)
    })

    it('stopt zonder netwerk (of bij een serverfout) en houdt wat nog niet verstuurd is', async () => {
      const outbox = createOutbox('test')
      outbox.enqueue(action({ target: 'item:1' }))
      outbox.enqueue(action({ target: 'item:2' }))
      outbox.enqueue(action({ target: 'item:3' }))
      const send = vi.fn(async (a) => {
        if (a.target === 'item:2') throw new ApiError('network', 'Kan de server niet bereiken.')
      })

      await expect(outbox.flush(send)).rejects.toMatchObject({ kind: 'network' })

      expect(summary(outbox).map((a) => a.target)).toEqual(['item:2', 'item:3'])
    })

    it('verstuurt niet dubbel als twee plekken tegelijk versturen', async () => {
      const outbox = createOutbox('test')
      outbox.enqueue(action({}))
      const send = vi.fn().mockResolvedValue(null)

      await Promise.all([outbox.flush(send), outbox.flush(send)])

      expect(send).toHaveBeenCalledTimes(1)
    })
  })
})
