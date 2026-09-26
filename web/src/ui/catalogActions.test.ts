import { beforeEach, describe, expect, it } from 'vitest'
import { designStore } from '../domain/designStore'
import { sampleCatalog } from '../fixtures/sample-catalog'
import { sampleRoom } from '../test/rooms'
import { cancelCatalogPreview, endPreview, placeEntry, previewEntry } from './catalogActions'

describe('explicit catalog previews', () => {
  beforeEach(() => designStore.getState().loadRoom(sampleRoom()))

  it('closing the catalog restores the room without adding history or purchases', () => {
    const before = designStore.getState().committed
    const bed = before!.room.objects.find((o) => o.category === 'bed')!
    previewEntry('card', sampleCatalog[0]!, { mode: 'swap', objectId: bed.id }, 1)
    expect(designStore.getState().preview).not.toBeNull()
    cancelCatalogPreview()
    expect(designStore.getState().preview).toBeNull()
    expect(designStore.getState().committed).toBe(before)
    expect(designStore.getState().past).toHaveLength(0)
  })

  it('a cancelled card cannot commit an old variant when reopened', () => {
    const bed = designStore.getState().committed!.room.objects.find((o) => o.category === 'bed')!
    const target = { mode: 'swap' as const, objectId: bed.id }
    previewEntry('card', sampleCatalog[0]!, target, 1)
    cancelCatalogPreview()
    expect(placeEntry('card', sampleCatalog[1]!, target, 1)).toBe(true)
    expect(designStore.getState().committed!.room.objects.find((o) => o.id === bed.id)!.variantId).toBe(
      sampleCatalog[1]!.variant.id,
    )
    expect(designStore.getState().undo()).toBe(true)
    expect(designStore.getState().committed!.room.objects.find((o) => o.id === bed.id)!.sourceKind).toBe('captured')
  })

  it('late cleanup from an earlier card leaves the current preview intact', () => {
    const bed = designStore.getState().committed!.room.objects.find((o) => o.category === 'bed')!
    const target = { mode: 'swap' as const, objectId: bed.id }
    previewEntry('first', sampleCatalog[0]!, target, 1)
    previewEntry('second', sampleCatalog[1]!, target, 1)
    endPreview('first')
    expect(designStore.getState().preview).not.toBeNull()
    cancelCatalogPreview()
  })
})
