import { beforeEach, describe, expect, it } from 'vitest'
import { designStore } from '../domain/designStore'
import { entryToObject } from '../domain/catalog'
import { sampleCatalog } from '../fixtures/sample-catalog'
import { sampleRoom } from '../test/rooms'
import { endPreview, placeEntry, previewEntry } from './catalogActions'

const entry = (variantId: string) => sampleCatalog.find((e) => e.variant.id === variantId)!

beforeEach(() => {
  // Two replaceable beds side by side; clear any preview a previous test left behind.
  const room = sampleRoom()
  const a = entryToObject(entry('v-alder-bed-full'), { id: 'bed-a', position: { x: -1, z: -0.5 }, yaw: 0 })
  const b = entryToObject(entry('v-alder-bed-full'), { id: 'bed-b', position: { x: 1, z: -0.5 }, yaw: 0 })
  designStore.getState().loadRoom({ ...room, objects: [a, b] })
  endPreview('card')
})

describe('catalog preview → commit', () => {
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
