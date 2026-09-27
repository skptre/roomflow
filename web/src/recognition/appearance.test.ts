import { describe, expect, it } from 'vitest'
import { createDesignStore } from '../domain/designStore'
import { sampleRoom } from '../test/rooms'
import { Appearance, appearanceCommand } from './appearance'

const description = { template: 'armchair', color: '#52677d', backColor: '#8091a0', confidence: 'medium', explanation: 'One seat with a tall back' } as const

describe('appearance recognition', () => {
  it('rejects model-generated geometry, unknown templates and malformed colors', () => {
    expect(Appearance.safeParse({ ...description, dimensions: { width: 42 } }).success).toBe(false)
    expect(Appearance.safeParse({ ...description, template: 'generated-code' }).success).toBe(false)
    expect(Appearance.safeParse({ ...description, color: 'red' }).success).toBe(false)
  })
  it('previews appearance without changing geometry, identity, keep/lock or purchases, and undoes it', () => {
    const store = createDesignStore()
    const room = sampleRoom()
    const object = room.objects[0]!
    object.keep = true
    object.lockPlacement = true
    store.getState().loadRoom(room)
    const revision = store.getState().committed!.revision
    const command = appearanceCommand(object.id, description, 'gemini-3.1-flash-lite')
    expect(store.getState().startPreview([command], { actor: 'auto', baseRevision: revision }).ok).toBe(true)
    expect(store.getState().committed!.room).toEqual(room)
    const shown = store.getState().preview!.room.objects[0]!
    expect(shown.dimensions).toEqual(object.dimensions)
    expect(shown.pose).toEqual(object.pose)
    expect(shown.keep).toBe(true)
    expect(shown.lockPlacement).toBe(true)
    expect(shown.sourceKind).toBe('captured')
    expect(shown.asset).not.toEqual(object.asset)
    store.getState().cancelPreview()
    expect(store.getState().committed!.room).toEqual(room)
    store.getState().startPreview([command], { actor: 'auto', baseRevision: revision })
    expect(store.getState().commitPreview().ok).toBe(true)
    expect(store.getState().undo()).toBe(true)
    expect(store.getState().committed!.room).toEqual(room)
  })
  it('rejects stale responses and refuses to restyle a purchased product', () => {
    const store = createDesignStore()
    const room = sampleRoom()
    room.objects[0]!.sourceKind = 'product'
    store.getState().loadRoom(room)
    const revision = store.getState().committed!.revision
    const command = appearanceCommand(room.objects[0]!.id, description, 'test')
    expect(store.getState().apply([command], { actor: 'auto', baseRevision: revision }).ok).toBe(false)
    store.getState().setBudget({ amountMinor: 10000, currency: 'USD' })
    expect(store.getState().startPreview([command], { actor: 'auto', baseRevision: revision })).toMatchObject({ ok: false, stale: true })
  })
})
