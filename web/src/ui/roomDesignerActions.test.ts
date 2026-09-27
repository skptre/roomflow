import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CatalogEntry } from '../domain/catalog'
import { designStore } from '../domain/designStore'
import { purchaseSummary } from '../domain/purchases'
import type { Money, Room } from '../domain/schema'
import { sampleCatalog } from '../fixtures/sample-catalog'
import type { RoomDesignIntent, RoomDesignRequest } from '../roomDesigner/contract'
import { roomSummary } from '../roomDesigner/contract'
import { sampleRoom } from '../test/rooms'
import { endPreview, ownsPreview, previewEntry } from './catalogActions'
import {
  applyRoomDesignerPreview,
  beginRoomDesignerPreview,
  cancelRoomDesignerPreview,
  designerCostReport,
  keptChangesRequest,
  ownedRoomDesignerPreview,
  parseBudgetInput,
  prepareRoomDesign,
  requestRoomDesign,
} from './roomDesignerActions'

const catalog: CatalogEntry[] = sampleCatalog.map((entry) => ({ ...entry, offer: { ...entry.offer, available: true } }))
const sources = { offers: new Map(catalog.map((entry) => [entry.offer.id, entry.offer])) }
const usd = (amountMinor: number): Money => ({ amountMinor, currency: 'USD' })
const intent = (change: Partial<RoomDesignIntent> = {}): RoomDesignIntent => ({ rearrange: 'none', removeObjectIds: [], replace: [], add: [], ...change })

function editableRoom(): Room {
  const room = sampleRoom()
  return { ...room, objects: room.objects.map((object) => ({ ...object, keep: false, lockPlacement: false })) }
}

function prepareNow(change: Partial<RoomDesignIntent>, entries: CatalogEntry[] = catalog, budget: Money | null = null) {
  const committed = designStore.getState().committed!
  return prepareRoomDesign(intent(change), { room: committed.room, catalog: entries, budget, baseRevision: committed.revision, sources })
}

beforeEach(() => {
  cancelRoomDesignerPreview()
  designStore.getState().loadRoom(editableRoom())
})

describe('room designer preview ownership', () => {
  it('previews a design without changing the committed room, purchases, or subtotal', () => {
    const before = designStore.getState().committed!
    const beforeSummary = purchaseSummary(before.room, sources, before.budget)
    const { proposal } = prepareNow({ palette: { mode: 'set', color: '#000000' }, removeObjectIds: ['OBJ-CHAIR'], add: [{ category: 'plant', count: 1 }] })
    expect(proposal.commands.length).toBeGreaterThan(1)
    expect(beginRoomDesignerPreview(proposal).ok).toBe(true)
    const state = designStore.getState()
    expect(state.preview).not.toBeNull()
    expect(state.preview).toBe(ownedRoomDesignerPreview())
    expect(state.committed).toBe(before)
    expect(purchaseSummary(state.committed!.room, sources, state.committed!.budget)).toEqual(beforeSummary)
    expect(cancelRoomDesignerPreview()).toBe(true)
    expect(designStore.getState().preview).toBeNull()
    expect(designStore.getState().committed).toBe(before)
  })

  it('takes over from a catalog preview but never cancels a newer preview it does not own', () => {
    const plant = catalog.find((entry) => entry.product.category === 'plant')!
    expect(previewEntry('card', plant, { mode: 'add' }, 1).ok).toBe(true)
    const { proposal } = prepareNow({ palette: { mode: 'darken' } })
    expect(beginRoomDesignerPreview(proposal).ok).toBe(true)
    expect(ownsPreview('card')).toBe(false)
    expect(previewEntry('card', plant, { mode: 'add' }, 1).ok).toBe(true)
    const catalogPreview = designStore.getState().preview
    expect(cancelRoomDesignerPreview()).toBe(false)
    expect(designStore.getState().preview).toBe(catalogPreview)
    expect(ownedRoomDesignerPreview()).toBeNull()
    endPreview('card')
  })

  it('refuses a design with no changes instead of showing an empty preview', () => {
    const { proposal } = prepareNow({})
    const result = beginRoomDesignerPreview(proposal)
    expect(result.ok).toBe(false)
    expect(designStore.getState().preview).toBeNull()
  })

  it('applies every command as one revision, and one undo restores furniture and money', () => {
    const before = designStore.getState().committed!
    const beforeSummary = purchaseSummary(before.room, sources, before.budget)
    const { proposal } = prepareNow({ palette: { mode: 'set', color: '#000000' }, removeObjectIds: ['OBJ-CHAIR'], add: [{ category: 'plant', count: 1 }] })
    expect(beginRoomDesignerPreview(proposal).ok).toBe(true)
    const result = applyRoomDesignerPreview(proposal)
    expect(result.ok).toBe(true)
    const after = designStore.getState()
    expect(after.committed!.revision).toBe(before.revision + 1)
    expect(after.past).toHaveLength(1)
    expect(after.preview).toBeNull()
    expect(ownedRoomDesignerPreview()).toBeNull()
    expect(after.committed!.room.finishes.wall).toBe('#000000')
    expect(after.committed!.room.objects.some((object) => object.id === 'OBJ-CHAIR')).toBe(false)
    expect(purchaseSummary(after.committed!.room, sources, null)).not.toEqual(beforeSummary)
    expect(designStore.getState().undo()).toBe(true)
    const undone = designStore.getState().committed!
    expect(undone.room).toEqual(before.room)
    expect(purchaseSummary(undone.room, sources, undone.budget)).toEqual(beforeSummary)
  })

  it('refuses a stale design, cancels its preview, and leaves the newer edit untouched', () => {
    const { proposal } = prepareNow({ palette: { mode: 'set', color: '#000000' } })
    expect(beginRoomDesignerPreview(proposal).ok).toBe(true)
    designStore.getState().apply([{ type: 'remove', id: 'OBJ-DESK' }], { actor: 'user' })
    const afterEdit = designStore.getState().committed!
    const result = applyRoomDesignerPreview(proposal)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.stale).toBe(true)
      expect(result.error).toMatch(/changed/i)
    }
    expect(designStore.getState().committed).toBe(afterEdit)
    expect(designStore.getState().preview).toBeNull()
    expect(ownedRoomDesignerPreview()).toBeNull()
    const again = beginRoomDesignerPreview(proposal)
    expect(again.ok).toBe(false)
    if (!again.ok) expect(again.stale).toBe(true)
  })

  it('leaves another tool preview alone when a stale apply fails', () => {
    const { proposal } = prepareNow({ palette: { mode: 'darken' } })
    designStore.getState().apply([{ type: 'remove', id: 'OBJ-DESK' }], { actor: 'user' })
    const plant = catalog.find((entry) => entry.product.category === 'plant')!
    expect(previewEntry('card', plant, { mode: 'add' }, 1).ok).toBe(true)
    const catalogPreview = designStore.getState().preview
    expect(applyRoomDesignerPreview(proposal).ok).toBe(false)
    expect(designStore.getState().preview).toBe(catalogPreview)
    endPreview('card')
  })

  it('refuses to apply once its preview was dismissed elsewhere', () => {
    const before = designStore.getState().committed
    const { proposal } = prepareNow({ palette: { mode: 'darken' } })
    expect(beginRoomDesignerPreview(proposal).ok).toBe(true)
    designStore.getState().cancelPreview()
    expect(applyRoomDesignerPreview(proposal).ok).toBe(false)
    expect(designStore.getState().committed).toBe(before)
  })
})

describe('room designer proposal facts', () => {
  it('explains kept and locked items that the design leaves alone', () => {
    const room = editableRoom()
    designStore.getState().loadRoom({ ...room, objects: room.objects.map((object) => ({ ...object, keep: true, lockPlacement: true })) })
    const { proposal } = prepareNow({ removeObjectIds: ['OBJ-CHAIR'], rearrange: 'full' })
    expect(proposal.commands).toEqual([])
    expect(proposal.skipped.join(' ')).toMatch(/keep/i)
  })

  it('reports budget unknown when a proposed item has no known price, never $0', () => {
    const plant = catalog.find((entry) => entry.product.category === 'plant')!
    const unpriced = { ...plant, offer: { ...plant.offer, id: 'unpriced-plant', price: null } }
    const committed = designStore.getState().committed!
    const prepared = prepareRoomDesign(intent({ add: [{ category: 'plant', count: 1 }] }), {
      room: committed.room, catalog: [unpriced], budget: null, baseRevision: committed.revision,
      sources: { offers: new Map([[unpriced.offer.id, unpriced.offer]]) },
    })
    expect(prepared.cost.added).toHaveLength(1)
    expect(prepared.cost.added[0]!.unitPrice).toBeNull()
    expect(prepared.cost.unknownPrices).toBeGreaterThan(0)
    expect(prepared.cost.budgetText).toMatch(/budget unknown/i)
    expect(prepared.cost.totalText).not.toMatch(/\$0\.00/)
  })

  it('separates new and removed purchases and states the budget result in its currency', () => {
    const plant = catalog.find((entry) => entry.product.category === 'plant' && entry.offer.price?.currency === 'USD')!
    const before = purchaseSummary({ ...sampleRoom(), objects: [] }, sources, usd(100_000_00))
    const room = designStore.getState().committed!.room
    const after = purchaseSummary(room, sources, usd(100_000_00))
    expect(designerCostReport(before, after, usd(100_000_00)).budgetText).toMatch(/within/i)
    const prepared = prepareNow({ add: [{ category: 'plant', count: 1 }] }, [plant], usd(100_000_00))
    expect(prepared.cost.added.map((row) => row.offerId)).toEqual([plant.offer.id])
    expect(prepared.cost.removed).toEqual([])
    const eur = designerCostReport(before, prepared.proposal.summary, { amountMinor: 100, currency: 'EUR' })
    expect(eur.budgetText).toMatch(/budget unknown/i)
  })
})

describe('changes to pieces marked Keep', () => {
  function keptNow(change: Partial<RoomDesignIntent>, allowKeptChanges?: boolean) {
    const committed = designStore.getState().committed!
    return prepareRoomDesign(intent(change), { room: committed.room, catalog, budget: null, baseRevision: committed.revision, sources, ...(allowKeptChanges === undefined ? {} : { allowKeptChanges }) })
  }

  it('explains an empty plan in a room where everything is marked Keep', () => {
    designStore.getState().loadRoom(sampleRoom())
    const prepared = keptNow({})
    expect(prepared.proposal.commands).toEqual([])
    expect(prepared.keepNotice).toBe('Everything in this room is marked Keep, so nothing was removed or replaced.')
  })

  it('explains skipped kept pieces with singular and plural wording, and stays quiet otherwise', () => {
    const room = editableRoom()
    const withKept = (ids: string[]) => ({ ...room, objects: room.objects.map((object) => ({ ...object, keep: ids.includes(object.id) })) })
    designStore.getState().loadRoom(withKept(['OBJ-CHAIR']))
    expect(keptNow({ removeObjectIds: ['OBJ-CHAIR'] }).keepNotice).toBe('This piece is marked Keep, so Gemini won’t remove or replace it.')
    designStore.getState().loadRoom(withKept(['OBJ-CHAIR', 'OBJ-DESK']))
    expect(keptNow({ removeObjectIds: ['OBJ-CHAIR', 'OBJ-DESK'] }).keepNotice).toBe('These pieces are marked Keep, so Gemini won’t remove or replace them.')
    expect(keptNow({}).keepNotice).toBe('These pieces are marked Keep, so Gemini won’t remove or replace them.')
    expect(keptNow({ palette: { mode: 'darken' } }).keepNotice).toBeNull()
    designStore.getState().loadRoom(withKept([]))
    expect(keptNow({}).keepNotice).toBeNull()
  })

  it('has no Keep notice once kept changes were allowed', () => {
    designStore.getState().loadRoom(sampleRoom())
    const prepared = keptNow({ removeObjectIds: ['OBJ-CHAIR'] }, true)
    expect(prepared.keepNotice).toBeNull()
    expect(prepared.proposal.notes).toContain('Removed Chair (was marked Keep).')
  })

  it('re-sends the same brief and budget with allowKeptChanges and a summary that lifts Keep but not locks', async () => {
    const room = sampleRoom()
    designStore.getState().loadRoom({ ...room, objects: room.objects.map((object, index) => ({ ...object, lockPlacement: index === 0 })) })
    const committed = designStore.getState().committed!
    const previous: RoomDesignRequest = { brief: 'Remove everything', consent: true, budget: usd(90000), baseRevision: committed.revision, roomSummary: roomSummary(committed.room) }
    const next = keptChangesRequest(previous, committed)
    expect(next).toMatchObject({ brief: 'Remove everything', consent: true, budget: usd(90000), baseRevision: committed.revision, allowKeptChanges: true })
    expect(next.roomSummary.objects.some((object) => object.keep)).toBe(false)
    expect(next.roomSummary.objects.map((object) => object.lockPlacement)).toEqual(committed.room.objects.map((object) => object.lockPlacement))
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ intent: intent() }), { status: 200 }))
    expect((await requestRoomDesign(next, committed.room, { fetchImpl })).ok).toBe(true)
    const sent = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body))
    expect(sent.allowKeptChanges).toBe(true)
    expect(sent.brief).toBe('Remove everything')
    expect(sent.budget).toEqual(usd(90000))
    expect(designStore.getState().committed!.room.objects.every((object) => object.keep)).toBe(true)
  })

  it('applies a design that removes a kept piece as one undoable step, without changing Keep before apply', () => {
    designStore.getState().loadRoom(sampleRoom())
    const before = designStore.getState().committed!
    const { proposal } = keptNow({ removeObjectIds: ['OBJ-CHAIR'] }, true)
    expect(beginRoomDesignerPreview(proposal).ok).toBe(true)
    expect(designStore.getState().committed).toBe(before)
    expect(before.room.objects.find((object) => object.id === 'OBJ-CHAIR')!.keep).toBe(true)
    expect(applyRoomDesignerPreview(proposal).ok).toBe(true)
    const after = designStore.getState()
    expect(after.committed!.revision).toBe(before.revision + 1)
    expect(after.past).toHaveLength(1)
    expect(after.committed!.room.objects.some((object) => object.id === 'OBJ-CHAIR')).toBe(false)
    expect(designStore.getState().undo()).toBe(true)
    expect(designStore.getState().committed!.room).toEqual(before.room)
  })

  it('refuses a stale design that changes kept pieces', () => {
    designStore.getState().loadRoom(sampleRoom())
    const { proposal } = keptNow({ removeObjectIds: ['OBJ-CHAIR'] }, true)
    expect(beginRoomDesignerPreview(proposal).ok).toBe(true)
    designStore.getState().apply([{ type: 'setLock', id: 'OBJ-DESK', lock: true }], { actor: 'user' })
    const afterEdit = designStore.getState().committed!
    const result = applyRoomDesignerPreview(proposal)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stale).toBe(true)
    expect(designStore.getState().committed).toBe(afterEdit)
    expect(afterEdit.room.objects.some((object) => object.id === 'OBJ-CHAIR')).toBe(true)
    const again = beginRoomDesignerPreview(proposal)
    expect(again.ok).toBe(false)
    if (!again.ok) expect(again.stale).toBe(true)
  })
})

describe('room design request', () => {
  function request(): RoomDesignRequest {
    const committed = designStore.getState().committed!
    return { brief: 'Turn everything black', consent: true, baseRevision: committed.revision, roomSummary: roomSummary(committed.room) }
  }

  it('returns a validated intent from the local endpoint without sending photos', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ intent: intent({ palette: { mode: 'set', color: '#000000' } }) }), { status: 200 }))
    const result = await requestRoomDesign(request(), designStore.getState().committed!.room, { fetchImpl })
    expect(result).toEqual({ ok: true, intent: intent({ palette: { mode: 'set', color: '#000000' } }) })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/design-room')
    expect(init.method).toBe('POST')
    const sent = JSON.parse(String(init.body))
    expect(sent.consent).toBe(true)
    expect(JSON.stringify(sent)).not.toMatch(/image|photo|base64/i)
  })

  it('keeps the room usable with a clear message when Gemini is unavailable', async () => {
    const unavailable = await requestRoomDesign(request(), designStore.getState().committed!.room, {
      fetchImpl: async () => new Response(JSON.stringify({ error: 'Room design is not configured on this computer.' }), { status: 503 }),
    })
    expect(unavailable).toEqual({ ok: false, error: expect.stringMatching(/not configured.*room is unchanged/i) })
    const offline = await requestRoomDesign(request(), designStore.getState().committed!.room, {
      fetchImpl: async () => { throw new TypeError('Failed to fetch') },
    })
    expect(offline.ok).toBe(false)
    if (!offline.ok) expect(offline.error).toMatch(/reach.*room is unchanged/i)
    const garbage = await requestRoomDesign(request(), designStore.getState().committed!.room, {
      fetchImpl: async () => new Response(JSON.stringify({ intent: { rearrange: 'full', removeObjectIds: ['NOPE'], replace: [], add: [] } }), { status: 200 }),
    })
    expect(garbage.ok).toBe(false)
    if (!garbage.ok) expect(garbage.error).toMatch(/invalid plan/i)
    expect(designStore.getState().preview).toBeNull()
  })

  it('does not send an invalid or unconsented request', async () => {
    const fetchImpl = vi.fn()
    const result = await requestRoomDesign({ ...request(), brief: '   ' }, designStore.getState().committed!.room, { fetchImpl })
    expect(result.ok).toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('explains a room that cannot be summarized separately from a bad brief', async () => {
    const fetchImpl = vi.fn()
    const base = request()
    const broken = await requestRoomDesign({ ...base, roomSummary: { ...base.roomSummary, floorPolygon: base.roomSummary.floorPolygon.slice(0, 2) } }, designStore.getState().committed!.room, { fetchImpl })
    expect(broken).toEqual({ ok: false, error: 'This room can’t be sent for design ideas. Your room is unchanged.' })
    const blank = await requestRoomDesign({ ...base, brief: '' }, designStore.getState().committed!.room, { fetchImpl })
    expect(blank.ok).toBe(false)
    if (!blank.ok) expect(blank.error).toMatch(/describe the room/i)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('parseBudgetInput', () => {
  it('parses major-unit text into integer minor units using the currency precision', () => {
    expect(parseBudgetInput('', 'USD')).toEqual({ ok: true, budget: null })
    expect(parseBudgetInput('1500', 'USD')).toEqual({ ok: true, budget: usd(150000) })
    expect(parseBudgetInput('12.5', 'USD')).toEqual({ ok: true, budget: usd(1250) })
    expect(parseBudgetInput('1,200.05', 'USD')).toEqual({ ok: true, budget: usd(120005) })
    expect(parseBudgetInput('900', 'JPY')).toEqual({ ok: true, budget: { amountMinor: 900, currency: 'JPY' } })
  })

  it('rejects amounts it cannot represent exactly', () => {
    for (const text of ['12.345', '-5', '1e3', 'abc', '9.5', '99999999999']) {
      const currency = text === '9.5' ? 'JPY' : 'USD'
      expect(parseBudgetInput(text, currency).ok).toBe(false)
    }
    expect(parseBudgetInput('10', 'usd').ok).toBe(false)
  })
})
