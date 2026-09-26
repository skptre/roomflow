import { beforeEach, describe, expect, it } from 'vitest'
import { designStore } from '../domain/designStore'
import { entryToObject } from '../domain/catalog'
import { sampleCatalog } from '../fixtures/sample-catalog'
import { sampleRoom } from '../test/rooms'
import { cancelCatalogPreview, endPreview, placeEntry, previewEntry } from './catalogActions'

const entry = (variantId: string) => sampleCatalog.find((e) => e.variant.id === variantId)!

describe('catalog preview → commit', () => {
  beforeEach(() => {
    // Two replaceable beds side by side; clear any preview a previous test left behind.
    const room = sampleRoom()
    const a = entryToObject(entry('v-alder-bed-full'), { id: 'bed-a', position: { x: -1, z: -0.5 }, yaw: 0 })
    const b = entryToObject(entry('v-alder-bed-full'), { id: 'bed-b', position: { x: 1, z: -0.5 }, yaw: 0 })
    designStore.getState().loadRoom({ ...room, objects: [a, b] })
    endPreview('card')
  })

  it('commits the choice for the current target, never a stale preview for another one', () => {
    const fiesta = entry('v-fiesta-bed-queen')
    expect(previewEntry('card', fiesta, { mode: 'swap', objectId: 'bed-a' }, 1).ok).toBe(true)
    // The selection moved to bed-b while the same card stayed mounted; clicking it must swap bed-b.
    expect(placeEntry('card', fiesta, { mode: 'swap', objectId: 'bed-b' }, 1)).toBe(true)
    const objects = designStore.getState().committed!.room.objects
    expect(objects.find((o) => o.id === 'bed-a')!.variantId).toBe('v-alder-bed-full')
    expect(objects.find((o) => o.id === 'bed-b')!.variantId).toBe('v-fiesta-bed-queen')
    expect(designStore.getState().preview).toBeNull()
  })

  it('reuses the live preview when nothing about the choice changed', () => {
    const fiesta = entry('v-fiesta-bed-queen')
    previewEntry('card', fiesta, { mode: 'swap', objectId: 'bed-a' }, 1)
    const previewCommands = designStore.getState().preview!.commands
    expect(placeEntry('card', fiesta, { mode: 'swap', objectId: 'bed-a' }, 1)).toBe(true)
    expect(designStore.getState().past).toHaveLength(1)
    expect(designStore.getState().committed!.room.objects.find((o) => o.id === 'bed-a')!.variantId).toBe(
      previewCommands[0]!.type === 'replace' ? previewCommands[0]!.with.variantId : 'x',
    )
  })

  it('does not reuse a preview built for a different quantity', () => {
    const lamp = entry('v-linen-floor-lamp-std')
    previewEntry('card', lamp, { mode: 'add' }, 1)
    expect(placeEntry('card', lamp, { mode: 'add' }, 3)).toBe(true)
    const added = designStore.getState().committed!.room.objects.find((o) => o.variantId === lamp.variant.id)!
    expect(added.quantity).toBe(3)
  })
})

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
