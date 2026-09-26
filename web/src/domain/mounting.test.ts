import { describe, expect, it } from 'vitest'
import { sampleCatalog, sampleOffers } from '../fixtures/sample-catalog'
import { sampleRoom } from '../test/rooms'
import { entryToObject, placementCommands } from './catalog'
import { applyCommands } from './commands'
import { footprint, pointInPolygon } from './geometry'
import { budgetForChoice, formatSubtotal, purchaseSummary } from './purchases'
import { subtotal } from './money'
import type { Room, RoomObject } from './schema'

const entry = (variantId: string) => sampleCatalog.find((e) => e.variant.id === variantId)!
const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' })

function addAndGet(room: Room, variantId: string): RoomObject {
  const commands = placementCommands(room, entry(variantId), { mode: 'add' })
  expect(commands).not.toBeNull()
  const result = applyCommands(room, commands!, 'user')
  if (!result.ok) throw new Error(result.error)
  expect(result.warnings).toEqual([])
  const added = commands![0]!
  if (added.type !== 'add') throw new Error('expected add')
  return result.room.objects.find((o) => o.id === added.object.id)!
}

function distanceToOutline(point: { x: number; z: number }, room: Room): number {
  let best = Infinity
  const polygon = room.floorPolygon
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!
    const b = polygon[(i + 1) % polygon.length]!
    const dx = b.x - a.x
    const dz = b.z - a.z
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / (dx * dx + dz * dz)))
    best = Math.min(best, Math.hypot(point.x - (a.x + t * dx), point.z - (a.z + t * dz)))
  }
  return best
}

/** The middle of the object's back edge, and a point a little in front of it. */
function backAndFront(object: RoomObject) {
  const { x, z } = object.pose.position
  const c = Math.cos(object.pose.yaw)
  const s = Math.sin(object.pose.yaw)
  const local = (lx: number, lz: number) => ({ x: x + lx * c + lz * s, z: z - lx * s + lz * c })
  return { back: local(0, -object.dimensions.depth / 2), front: local(0, object.dimensions.depth / 2 + 0.3) }
}

describe('mount-aware placement', () => {
  it('hangs wall art on a wall at mounting height, facing into the room', () => {
    const room = sampleRoom()
    const art = addAndGet(room, 'v-dune-print-std')
    expect(art.pose.position.y).toBeCloseTo(1.2)
    const { back, front } = backAndFront(art)
    expect(distanceToOutline(back, room)).toBeLessThan(0.02)
    expect(pointInPolygon(front, room.floorPolygon)).toBe(true)
  })

  it('never hangs wall art across a door or window', () => {
    const room = sampleRoom()
    const art = addAndGet(room, 'v-dune-print-large')
    const wall = room.walls.find((w) => {
      const { back } = backAndFront(art)
      const dx = w.end.x - w.start.x
      const dz = w.end.z - w.start.z
      const length = Math.hypot(dx, dz)
      return Math.abs((back.x - w.start.x) * dz - (back.z - w.start.z) * dx) / length < 0.02
    })!
    const along = ((art.pose.position.x - wall.start.x) * (wall.end.x - wall.start.x) + (art.pose.position.z - wall.start.z) * (wall.end.z - wall.start.z)) / Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z)
    for (const opening of room.openings.filter((o) => o.wallId === wall.id)) {
      const apart = Math.abs(along - opening.offsetAlongWall) >= (opening.width + art.dimensions.width) / 2 - 1e-6
      const clearVertically = art.pose.position.y >= opening.bottom + opening.height || art.pose.position.y + art.dimensions.height <= opening.bottom
      expect(apart || clearVertically).toBe(true)
    }
  })

  it('stands a floor mirror against a wall', () => {
    const room = sampleRoom()
    const mirror = addAndGet(room, 'v-brass-mirror-std')
    expect(mirror.pose.position.y).toBe(0)
    expect(distanceToOutline(backAndFront(mirror).back, room)).toBeLessThan(0.02)
  })

  it('sets a vase on top of a piece of furniture, fully on its surface', () => {
    const room = sampleRoom()
    const vase = addAndGet(room, 'v-clay-vase-std')
    const support = room.objects.find((o) => Math.abs(o.pose.position.y + o.dimensions.height - vase.pose.position.y) < 1e-6)
    expect(support).toBeDefined()
    for (const corner of footprint(vase)) expect(pointInPolygon(corner, footprint(support!))).toBe(true)
  })

  it('has nowhere to put a vase in a room without tables or storage', () => {
    const room: Room = { ...sampleRoom(), objects: [] }
    expect(placementCommands(room, entry('v-clay-vase-std'), { mode: 'add' })).toBeNull()
  })
})

describe('budgetForChoice', () => {
  const sources = { offers: sampleOffers }
  const queen = entry('v-alder-bed-queen')

  it('excludes the item being replaced when browsing its alternatives', () => {
    const room: Room = { ...sampleRoom(), objects: [entryToObject(queen, { id: 'bed', position: { x: 0, z: 0 }, yaw: 0 })] }
    // $700 budget, $649 queen bought: adding anything has $51 left, but swapping the queen has $700.
    expect(budgetForChoice(room, sources, usd(70000))).toEqual(usd(5100))
    expect(budgetForChoice(room, sources, usd(70000), 'bed')).toEqual(usd(70000))
  })

  it('stays unknown while another purchase has no price', () => {
    const rattan = entry('v-rattan-nightstand-std')
    const room: Room = {
      ...sampleRoom(),
      objects: [entryToObject(queen, { id: 'bed', position: { x: 0, z: 0 }, yaw: 0 }), entryToObject(rattan, { id: 'ns', position: { x: 1, z: 1 }, yaw: 0 })],
    }
    expect(budgetForChoice(room, sources, usd(70000), 'bed')).toBeNull()
    expect(budgetForChoice(room, sources, usd(70000), 'ns')).toEqual(usd(5100))
  })

  it('keeps the budget out of it when there is none', () => {
    expect(budgetForChoice(sampleRoom(), sources, null)).toBeNull()
  })
})

describe('formatSubtotal', () => {
  it('never shows an unknown cost as zero', () => {
    expect(formatSubtotal(subtotal([{ id: 'a', unitPrice: null, quantity: 1, owned: false }]))).toBe('Price unknown')
  })

  it('shows known totals, zero for nothing bought, and each currency when mixed', () => {
    expect(formatSubtotal(subtotal([]))).toBe('$0.00')
    expect(formatSubtotal(subtotal([{ id: 'a', unitPrice: usd(2599), quantity: 1, owned: false }]))).toBe('$25.99')
    expect(
      formatSubtotal(
        subtotal([
          { id: 'a', unitPrice: usd(100), quantity: 1, owned: false },
          { id: 'b', unitPrice: { amountMinor: 200, currency: 'EUR' }, quantity: 1, owned: false },
        ]),
      ),
    ).toBe('€2.00 + $1.00')
  })

  it('shows the known part of a partly priced subtotal', () => {
    const sub = subtotal([
      { id: 'a', unitPrice: usd(500), quantity: 1, owned: false },
      { id: 'b', unitPrice: null, quantity: 1, owned: false },
    ])
    expect(formatSubtotal(sub)).toBe('$5.00')
    expect(purchaseSummary(sampleRoom(), { offers: sampleOffers }, null).subtotal.status).toBe('complete')
  })
})
