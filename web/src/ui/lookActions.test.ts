import { beforeEach, describe, expect, it } from 'vitest'
import { designStore } from '../domain/designStore'
import { buildProposal, THEMES } from '../domain/themes'
import { sampleCatalog } from '../fixtures/sample-catalog'
import { sampleRoom } from '../test/rooms'
import { commitLook, endLookPreview, previewLook } from './lookActions'
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
})
