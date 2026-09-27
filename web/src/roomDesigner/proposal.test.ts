import { describe, expect, it } from 'vitest'
import { sampleCatalog } from '../fixtures/sample-catalog'
import { sampleRoom } from '../test/rooms'
import { entryToObject, type CatalogEntry } from '../domain/catalog'
import { applyCommands } from '../domain/commands'
import { blocksDoorway } from '../domain/layout'
import type { Money, Room } from '../domain/schema'
import type { RoomDesignIntent } from './contract'
import { buildRoomDesignProposal } from './proposal'

const catalog = sampleCatalog.map((entry) => ({ ...entry, offer: { ...entry.offer, available: true } }))
const usd = (amountMinor: number): Money => ({ amountMinor, currency: 'USD' })
const intent = (change: Partial<RoomDesignIntent> = {}): RoomDesignIntent => ({ rearrange: 'none', removeObjectIds: [], replace: [], add: [], ...change })
const build = (change: Partial<RoomDesignIntent>, room = sampleRoom(), entries: CatalogEntry[] = catalog, budget: Money | null = null, baseRevision = 3) =>
  buildRoomDesignProposal({ intent: intent(change), room, catalog: entries, budget, baseRevision })

describe('buildRoomDesignProposal', () => {
  it('rearranges movable furniture deterministically and produces auto-applicable commands', () => {
    const base = sampleRoom()
    const chair = base.objects.find((object) => object.id === 'OBJ-CHAIR')!
    const room = { ...base, objects: [{ ...chair, keep: false, lockPlacement: false }] }
    const first = build({ rearrange: 'full' }, room)
    const second = build({ rearrange: 'full' }, room)
    expect(first).toEqual(second)
    expect(first.baseRevision).toBe(3)
    expect(first.commands.some((command) => command.type === 'move' || command.type === 'rotate')).toBe(true)
    expect(applyCommands(room, first.commands, 'auto').ok).toBe(true)
    expect(build({ rearrange: 'full' }, room, catalog, null, 4).commands).not.toEqual(first.commands)
  })

  it('uses the alternate yaw when the original yaw would block a doorway', () => {
    const base = sampleRoom()
    const chair = base.objects.find((object) => object.id === 'OBJ-CHAIR')!
    const object = { ...chair, keep: false, lockPlacement: false, dimensions: { width: 1.2, height: 0.8, depth: 0.4, source: 'estimated' as const }, pose: { position: { x: -0.3, y: 0, z: 0.6 }, yaw: 0 } }
    const room: Room = {
      ...base,
      id: 'alternate-yaw-doorway-fixture',
      floorPolygon: [{ x: -1, z: -1 }, { x: 1, z: -1 }, { x: 1, z: 1 }, { x: -1, z: 1 }],
      walls: [{ id: 'right', start: { x: 1, z: -1 }, end: { x: 1, z: 1 }, height: 2.5, thickness: 0.1, exterior: true }],
      openings: [{ id: 'door', kind: 'door', wallId: 'right', offsetAlongWall: 0.5, bottom: 0, width: 0.5, height: 2.1 }],
      objects: [object],
    }
    const proposals = Array.from({ length: 16 }, (_, revision) => build({ rearrange: 'full' }, room, catalog, null, revision))
    const alternate = proposals.find((proposal) => {
      const result = applyCommands(room, proposal.commands, 'auto')
      if (!result.ok) return false
      const placed = result.room.objects[0]!
      return placed.pose.yaw !== object.pose.yaw && blocksDoorway(room, { ...placed, pose: { ...placed.pose, yaw: object.pose.yaw } })
    })
    expect(alternate).toBeDefined()
    const result = applyCommands(room, alternate!.commands, 'auto')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const placed = result.room.objects[0]!
    expect(alternate!.commands.map((command) => command.type)).toEqual(expect.arrayContaining(['move', 'rotate']))
    expect(blocksDoorway(result.room, placed)).toBe(false)
  })

  it('restyles to a requested black palette without changing the source room', () => {
    const room = sampleRoom()
    const before = structuredClone(room)
    const proposal = build({ palette: { mode: 'set', color: '#000000' } }, room)
    expect(proposal.commands).toHaveLength(1)
    const restyle = proposal.commands[0]!
    expect(restyle).toMatchObject({ type: 'restyle', finishes: { wall: '#000000', accent: '#000000' } })
    if (restyle.type !== 'restyle') return
    expect(restyle.finishes.floor).not.toBe('#000000')
    expect(proposal.notes).toContain('Furniture colors aren’t changed; replace pieces to change them.')
    expect(room).toEqual(before)
  })

  it.each(['#000000', '#ffffff', '#808080', '#7f7f7f', '#ff0000', '#101828', '#f5f0e6'])('keeps a set floor color %s readable and distinct from the walls', (color) => {
    const proposal = build({ palette: { mode: 'set', color } })
    const restyle = proposal.commands[0]!
    if (restyle.type !== 'restyle') throw new Error('expected restyle')
    const lightness = (hex: string) => [1, 3, 5].reduce((sum, start) => sum + parseInt(hex.slice(start, start + 2), 16), 0) / (3 * 255)
    expect(restyle.finishes.wall).toBe(color)
    expect(restyle.finishes.accent).toBe(color)
    expect(restyle.finishes.floor).toMatch(/^#[0-9a-f]{6}$/)
    expect(Math.abs(lightness(restyle.finishes.floor) - lightness(color))).toBeGreaterThanOrEqual(0.1)
    expect(lightness(restyle.finishes.floor)).toBeGreaterThanOrEqual(0.12)
    expect(lightness(restyle.finishes.floor)).toBeLessThanOrEqual(0.88)
  })

  it('removes, replaces and adds only actual catalog entries, preserving their offer identity', () => {
    const base = sampleRoom()
    const room = { ...base, objects: base.objects.map((object) => ['OBJ-CHAIR', 'OBJ-DESK'].includes(object.id) ? { ...object, keep: false } : object) }
    const proposal = build({ removeObjectIds: ['OBJ-CHAIR'], replace: [{ objectId: 'OBJ-DESK', category: 'desk', count: 1 }], add: [{ category: 'plant', count: 1 }] }, room)
    expect(proposal.commands.map((command) => command.type)).toEqual(expect.arrayContaining(['remove', 'replace', 'add']))
    const result = applyCommands(room, proposal.commands, 'auto')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    for (const object of result.room.objects.filter((item) => item.sourceKind === 'product')) {
      const source = catalog.find((entry) => entry.variant.id === object.variantId && entry.offer.id === object.offerId)
      expect(source).toBeDefined()
      expect(object.name).toBe(source!.product.name)
      expect(object.dimensions).toEqual(source!.variant.dimensions)
    }
  })

  it('prunes over-budget, foreign-currency and unknown-price offers under a budget', () => {
    const plant = catalog.find((entry) => entry.product.category === 'plant')!
    const eur = { ...plant, offer: { ...plant.offer, id: 'eur', price: { amountMinor: 1, currency: 'EUR' } } }
    const expensive = { ...plant, offer: { ...plant.offer, id: 'expensive', price: usd(50000) } }
    const pruned = build({ add: [{ category: 'plant', count: 1 }] }, sampleRoom(), [eur, expensive], usd(100))
    expect(pruned.commands).toEqual([])
    expect(pruned.skipped.join(' ')).toMatch(/budget|currency/i)
    const unknown = { ...plant, offer: { ...plant.offer, id: 'unknown', price: null } }
    const proposal = build({ add: [{ category: 'plant', count: 1 }] }, sampleRoom(), [unknown], usd(50000))
    expect(proposal.commands).toEqual([])
    expect(proposal.skipped.join(' ')).toMatch(/known price/i)
    const withoutBudget = build({ add: [{ category: 'plant', count: 1 }] }, sampleRoom(), [unknown])
    expect(withoutBudget.commands.some((command) => command.type === 'add')).toBe(true)
    expect(withoutBudget.summary.subtotal.status).toBe('incomplete')
    expect(proposal.summary.budget).toBe('under')
  })

  it('refuses keep removal and replacement, and locked moves or replacement nudges', () => {
    const room = sampleRoom()
    const chair = room.objects.find((object) => object.id === 'OBJ-CHAIR')!
    const locked: Room = { ...room, objects: room.objects.map((object) => object.id === chair.id ? { ...object, keep: true, lockPlacement: true } : object) }
    const protectedProposal = build({ rearrange: 'full', removeObjectIds: [chair.id] }, locked)
    expect(protectedProposal.commands).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: chair.id, type: 'remove' })]))
    expect(protectedProposal.skipped.join(' ')).toMatch(/keep/i)
    const replaceProposal = build({ replace: [{ objectId: chair.id, category: 'lounge-chair', count: 1 }] }, locked)
    expect(replaceProposal.commands).toEqual([])
    expect(replaceProposal.skipped.join(' ')).toMatch(/keep/i)
    const moveProposal = build({ rearrange: 'full' }, { ...room, objects: room.objects.map((object) => ({ ...object, lockPlacement: true })) })
    expect(moveProposal.commands).toEqual([])
    const edgeChair = { ...chair, keep: false, lockPlacement: true, pose: { ...chair.pose, position: { x: 1.65, y: 0, z: 0 } } }
    const edgeRoom = { ...room, objects: [edgeChair] }
    const sofa = catalog.filter((entry) => entry.product.category === 'sofa')
    const clamped = build({ replace: [{ objectId: chair.id, category: 'sofa', count: 1 }] }, edgeRoom, sofa)
    expect(clamped.commands).toEqual([])
    expect(clamped.skipped.join(' ')).toMatch(/locked|fit/i)
  })

  it('reports a full-room skip rather than emitting an unsafe addition', () => {
    const room = sampleRoom()
    const bed = catalog.find((entry) => entry.variant.id === 'v-alder-bed-king')!
    const proposal = build({ add: [{ category: 'bed', count: 1 }] }, room, [bed])
    expect(proposal.commands).toEqual([])
    expect(proposal.skipped.join(' ')).toMatch(/space|fit|spot/i)
  })

  it('never adds sold-out or unreported-availability entries', () => {
    const soldOut = catalog.filter((entry) => entry.product.category === 'plant').map((entry) => ({ ...entry, offer: { ...entry.offer, available: false } }))
    const proposal = build({ add: [{ category: 'plant', count: 1 }] }, sampleRoom(), soldOut)
    expect(proposal.commands).toEqual([])
    expect(proposal.skipped.join(' ')).toMatch(/catalog|stock/i)
    const unreported = catalog.filter((entry) => entry.product.category === 'plant').map((entry) => ({ ...entry, offer: { ...entry.offer, available: undefined } }))
    const unknownStock = build({ add: [{ category: 'plant', count: 1 }] }, sampleRoom(), unreported)
    expect(unknownStock.commands).toEqual([])
    expect(unknownStock.skipped.join(' ')).toMatch(/stock/i)
  })

  it('retains known totals and merchant for an existing product after its offer loses stock status', () => {
    const lamp = catalog.find((entry) => entry.variant.id === 'v-linen-floor-lamp-std')!
    const room: Room = { ...sampleRoom(), objects: [entryToObject(lamp, { id: 'existing-lamp', position: { x: 0, z: 0 }, yaw: 0 })] }
    for (const available of [false, undefined]) {
      const stale = { ...lamp, offer: { ...lamp.offer, available } }
      const proposal = build({ add: [{ category: 'floor-lamp', count: 1 }] }, room, [stale], usd(50000))
      expect(proposal.commands).toEqual([])
      expect(proposal.skipped.join(' ')).toMatch(/stock/i)
      expect(proposal.summary.subtotal.total).toEqual(lamp.offer.price)
      expect(proposal.summary.budget).toBe('under')
      expect(proposal.summary.lines[0]).toMatchObject({ offerId: lamp.offer.id, store: lamp.offer.merchant, unitPrice: lamp.offer.price })
    }
  })

  it('reports incomplete cost when an existing product has an unknown offer', () => {
    const unpriced = catalog.find((entry) => entry.offer.price === null)!
    const object = entryToObject(unpriced, { id: 'unpriced', position: { x: 0, z: 0 }, yaw: 0 })
    const room = { ...sampleRoom(), objects: [object] }
    const proposal = build({}, room, catalog, usd(50000))
    expect(proposal.summary.budget).toBe('unknown')
  })
})
