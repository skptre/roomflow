import { beforeEach, describe, expect, it } from 'vitest'
import { designStore } from '../domain/designStore'
import { buildProposal, THEMES } from '../domain/themes'
import { sampleCatalog } from '../fixtures/sample-catalog'
import { sampleRoom } from '../test/rooms'
import { cancelCatalogPreview, endPreview, placeEntry, previewEntry } from './catalogActions'
import { cancelActivePreview, commitLook, endLookPreview, previewLook } from './lookActions'
import { noticeStore } from './noticeStore'

const theme = THEMES[0]!

function proposalNow() {
  const committed = designStore.getState().committed!
  return buildProposal(committed.room, theme, sampleCatalog, committed.budget, committed.revision)
}

beforeEach(() => {
  designStore.getState().loadRoom(sampleRoom())
  noticeStore.getState().dismiss()
})

describe('look preview and commit', () => {
  it('previews a look without changing the committed room, and cancels cleanly', () => {
    const before = designStore.getState().committed
    expect(previewLook(theme.id, proposalNow())).toBe(true)
    expect(designStore.getState().preview).not.toBeNull()
    expect(designStore.getState().committed).toBe(before)
    endLookPreview(theme.id)
    expect(designStore.getState().preview).toBeNull()
  })

  it('makes a look yours as one undoable step', () => {
    const before = designStore.getState().committed!.room
    const proposal = proposalNow()
    previewLook(theme.id, proposal)
    expect(commitLook(theme, proposal)).toBe(true)
    expect(designStore.getState().committed!.room.finishes).toEqual(theme.finishes)
    expect(designStore.getState().past).toHaveLength(1)
    designStore.getState().undo()
    expect(designStore.getState().committed!.room).toEqual(before)
  })

  it('refuses a look built before a newer edit, instead of overwriting it', () => {
    const stale = proposalNow()
    designStore.getState().apply([{ type: 'remove', id: 'OBJ-CHAIR' }], { actor: 'user' })
    const afterEdit = designStore.getState().committed!.room
    expect(commitLook(theme, stale)).toBe(false)
    expect(designStore.getState().committed!.room).toBe(afterEdit)
    expect(noticeStore.getState().notice?.text).toMatch(/changed/i)
  })

  it('does not cancel a newer catalog preview when a look card is left', () => {
    expect(previewLook(theme.id, proposalNow())).toBe(true)
    const chair = sampleCatalog.find((entry) => entry.product.category === 'desk-chair')!
    expect(previewEntry('card', chair, { mode: 'swap', objectId: 'OBJ-CHAIR' }, 1).ok).toBe(true)
    const catalogPreview = designStore.getState().preview
    endLookPreview(theme.id)
    expect(designStore.getState().preview).toBe(catalogPreview)
    endPreview('card')
  })

  it('does not cancel a newer look preview when catalog cleanup runs', () => {
    const chair = sampleCatalog.find((entry) => entry.product.category === 'desk-chair')!
    expect(previewEntry('card', chair, { mode: 'swap', objectId: 'OBJ-CHAIR' }, 1).ok).toBe(true)
    expect(previewLook(theme.id, proposalNow())).toBe(true)
    const lookPreview = designStore.getState().preview
    cancelCatalogPreview()
    endPreview('card')
    expect(designStore.getState().preview).toBe(lookPreview)
    cancelActivePreview()
    expect(designStore.getState().preview).toBeNull()
  })

  it('never commits look commands through a stale catalog preview key', () => {
    const chair = sampleCatalog.find((entry) => entry.product.category === 'desk-chair')!
    const target = { mode: 'swap' as const, objectId: 'OBJ-CHAIR' }
    expect(previewEntry('card', chair, target, 1).ok).toBe(true)
    cancelCatalogPreview()
    expect(previewLook(theme.id, proposalNow())).toBe(true)
    expect(placeEntry('card', chair, target, 1)).toBe(true)
    const committed = designStore.getState().committed!.room
    expect(committed.objects.find((object) => object.id === 'OBJ-CHAIR')?.variantId).toBe(chair.variant.id)
    expect(committed.finishes).not.toEqual(theme.finishes)
  })

  it('leaves a newer catalog preview alone when a stale look commit fails', () => {
    const stale = proposalNow()
    designStore.getState().apply([{ type: 'remove', id: 'OBJ-CHAIR' }], { actor: 'user' })
    const bed = sampleCatalog.find((entry) => entry.product.category === 'bed')!
    expect(previewEntry('card', bed, { mode: 'swap', objectId: 'OBJ-BED' }, 1).ok).toBe(true)
    const catalogPreview = designStore.getState().preview
    expect(commitLook(theme, stale)).toBe(false)
    expect(designStore.getState().preview).toBe(catalogPreview)
    endPreview('card')
  })
})
