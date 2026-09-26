import { beforeEach, describe, expect, it } from 'vitest'
import { lamp, sampleRoom } from '../test/rooms'
import { createDesignStore, purchaseLines, viewRoom, type ApplyOptions, type DesignStore } from './designStore'
import { subtotal } from './money'
import type { Offer } from './schema'

const offers = new Map<string, Offer>([
  [
    'o-lamp',
    {
      id: 'o-lamp',
      variantId: 'v-lamp',
      merchant: 'Sample catalog',
      price: { amountMinor: 8900, currency: 'USD' },
      retrievedAt: '2026-09-26T00:00:00.000Z',
      isSample: true,
    },
  ],
])

let store: DesignStore

function committedRoom() {
  return store.getState().committed!.room
}

function committedSubtotal() {
  return subtotal(purchaseLines(committedRoom(), { offers }))
}

function viewSubtotal() {
  return subtotal(purchaseLines(viewRoom(store.getState())!, { offers }))
}

beforeEach(() => {
  store = createDesignStore()
  store.getState().loadRoom(sampleRoom(), { amountMinor: 60000, currency: 'USD' })
})

describe('purchaseLines', () => {
  it('derives purchases from committed objects; captured furniture is already owned', () => {
    const lines = purchaseLines(committedRoom(), { offers })
    expect(lines.every((line) => line.owned)).toBe(true)
    expect(subtotal(lines).lineCount).toBe(0)
  })

  it('treats a product without a known offer as unpriced, never free', () => {
    store.getState().apply([{ type: 'add', object: { ...lamp(), offerId: 'missing' } }], { actor: 'user' })
    const sub = committedSubtotal()
    expect(sub.status).toBe('incomplete')
    expect(sub.unpricedCount).toBe(1)
  })

  it('leaves a line unpriced when its offer belongs to a different variant', () => {
    store.getState().apply([{ type: 'add', object: { ...lamp(), variantId: 'v-other' } }], { actor: 'user' })
    const sub = committedSubtotal()
    expect(sub.status).toBe('incomplete')
    expect(sub.total).toBeNull()
  })
})

describe('apply / undo / redo', () => {
  it('bumps the revision and records history', () => {
    const before = store.getState().committed!.revision
    const result = store.getState().apply([{ type: 'add', object: lamp() }], { actor: 'user' })
    expect(result.ok).toBe(true)
    expect(store.getState().committed!.revision).toBe(before + 1)
    expect(store.getState().past).toHaveLength(1)
  })

  it('undo restores the room and the subtotal; redo reapplies both', () => {
    const roomBefore = committedRoom()
    const subBefore = committedSubtotal()
    store.getState().apply([{ type: 'add', object: lamp() }], { actor: 'user' })
    expect(committedSubtotal().total).toEqual({ amountMinor: 8900, currency: 'USD' })

    store.getState().undo()
    expect(committedRoom()).toEqual(roomBefore)
    expect(committedSubtotal()).toEqual(subBefore)

    store.getState().redo()
    expect(committedSubtotal().total).toEqual({ amountMinor: 8900, currency: 'USD' })
  })

  it('undo also restores the budget changed by setBudget', () => {
    store.getState().setBudget({ amountMinor: 10000, currency: 'USD' })
    expect(store.getState().committed!.budget).toEqual({ amountMinor: 10000, currency: 'USD' })
    store.getState().undo()
    expect(store.getState().committed!.budget).toEqual({ amountMinor: 60000, currency: 'USD' })
  })

  it('a new apply clears the redo stack', () => {
    store.getState().apply([{ type: 'add', object: lamp() }], { actor: 'user' })
    store.getState().undo()
    expect(store.getState().future).toHaveLength(1)
    store.getState().apply([{ type: 'remove', id: 'OBJ-CHAIR' }], { actor: 'user' })
    expect(store.getState().future).toHaveLength(0)
  })

  it('caps history at 100 steps', () => {
    for (let i = 0; i < 105; i++) {
      store.getState().apply([{ type: 'rotate', id: 'OBJ-CHAIR', yaw: (i % 2) * 0.1 }], { actor: 'user' })
    }
    expect(store.getState().past).toHaveLength(100)
  })

  it('rejects a stale baseRevision and leaves the room untouched', () => {
    const stale = store.getState().committed!.revision
    store.getState().apply([{ type: 'remove', id: 'OBJ-CHAIR' }], { actor: 'user' })
    const roomAfterUserEdit = committedRoom()
    const result = store.getState().apply([{ type: 'remove', id: 'OBJ-DESK' }], { actor: 'auto', baseRevision: stale })
    expect(result).toMatchObject({ ok: false, stale: true })
    expect(committedRoom()).toBe(roomAfterUserEdit)
  })

  it('requires a base revision for automated edits and previews', () => {
    // Simulates a caller that bypasses the types (e.g. untyped generated data).
    const noRevision = { actor: 'auto' } as unknown as ApplyOptions
    const add = [{ type: 'add' as const, object: lamp() }]
    expect(store.getState().apply(add, noRevision).ok).toBe(false)
    expect(store.getState().startPreview(add, noRevision).ok).toBe(false)
    expect(committedRoom().objects.some((o) => o.id === 'lamp-1')).toBe(false)
    expect(store.getState().preview).toBeNull()
    // With the current revision the same automated edit is accepted.
    const revision = store.getState().committed!.revision
    expect(store.getState().apply(add, { actor: 'auto', baseRevision: revision }).ok).toBe(true)
  })

  it('a failed command changes nothing', () => {
    const state = store.getState()
    const result = state.apply([{ type: 'remove', id: 'nope' }], { actor: 'user' })
    expect(result.ok).toBe(false)
    expect(store.getState().committed).toBe(state.committed)
    expect(store.getState().past).toHaveLength(0)
  })

  it('undo bumps the revision so results computed before it become stale', () => {
    store.getState().apply([{ type: 'add', object: lamp() }], { actor: 'user' })
    const revision = store.getState().committed!.revision
    store.getState().undo()
    expect(store.getState().committed!.revision).toBeGreaterThan(revision)
  })
})

describe('preview', () => {
  it('shows the preview in viewRoom without touching the committed room or subtotal', () => {
    const committedBefore = store.getState().committed
    store.getState().startPreview([{ type: 'add', object: lamp() }])
    expect(viewRoom(store.getState())!.objects.some((o) => o.id === 'lamp-1')).toBe(true)
    expect(viewSubtotal().total).toEqual({ amountMinor: 8900, currency: 'USD' })
    expect(store.getState().committed).toBe(committedBefore)
    expect(committedSubtotal().lineCount).toBe(0)
  })

  it('cancel restores the exact previous presentation (RF3)', () => {
    store.getState().select('OBJ-BED')
    const before = {
      committed: structuredClone(store.getState().committed),
      view: structuredClone(viewRoom(store.getState())),
      selectedId: store.getState().selectedId,
      subtotal: viewSubtotal(),
    }
    store.getState().startPreview([{ type: 'replace', id: 'OBJ-CHAIR', with: lamp() }])
    store.getState().cancelPreview()
    expect({
      committed: store.getState().committed,
      view: viewRoom(store.getState()),
      selectedId: store.getState().selectedId,
      subtotal: viewSubtotal(),
    }).toEqual(before)
    expect(store.getState().preview).toBeNull()
  })

  it('commitPreview is a single undo step', () => {
    const roomBefore = committedRoom()
    store.getState().startPreview([
      { type: 'add', object: lamp() },
      { type: 'remove', id: 'OBJ-CHAIR' },
    ])
    expect(store.getState().commitPreview().ok).toBe(true)
    expect(store.getState().preview).toBeNull()
    expect(store.getState().past).toHaveLength(1)
    store.getState().undo()
    expect(committedRoom()).toEqual(roomBefore)
  })

  it('refuses to commit a preview whose base revision is stale', () => {
    store.getState().startPreview([{ type: 'add', object: lamp() }])
    store.getState().setBudget(null)
    // setBudget committed a new revision; the preview is no longer based on it.
    expect(store.getState().preview).toBeNull()
    const result = store.getState().commitPreview()
    expect(result.ok).toBe(false)
  })

  it('clears selection and hover of preview-only objects on cancel', () => {
    store.getState().startPreview([{ type: 'add', object: lamp() }])
    store.getState().select('lamp-1')
    store.getState().hover('lamp-1')
    store.getState().cancelPreview()
    expect(store.getState().selectedId).toBeNull()
    expect(store.getState().hoveredId).toBeNull()
  })

  it('does not start a preview from invalid commands', () => {
    const result = store.getState().startPreview([{ type: 'remove', id: 'nope' }])
    expect(result.ok).toBe(false)
    expect(store.getState().preview).toBeNull()
  })
})

describe('selection', () => {
  it('survives a commit when the object still exists and clears when it is removed', () => {
    store.getState().select('OBJ-BED')
    store.getState().apply([{ type: 'move', id: 'OBJ-BED', position: { x: -0.6, z: 0.6 } }], { actor: 'user' })
    expect(store.getState().selectedId).toBe('OBJ-BED')
    store.getState().apply([{ type: 'remove', id: 'OBJ-BED' }], { actor: 'user' })
    expect(store.getState().selectedId).toBeNull()
  })

  it('clears a hover target that no longer exists after undo', () => {
    store.getState().apply([{ type: 'add', object: lamp() }], { actor: 'user' })
    store.getState().hover('lamp-1')
    store.getState().undo()
    expect(store.getState().hoveredId).toBeNull()
  })
})
