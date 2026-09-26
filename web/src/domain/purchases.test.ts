import { describe, expect, it } from 'vitest'
import { sampleCatalog, sampleOffers, sampleVariantLabels } from '../fixtures/sample-catalog'
import { lamp, sampleRoom } from '../test/rooms'
import { entryToObject, placementCommands } from './catalog'
import { alternativeCategories } from './categories'
import { applyCommands } from './commands'
import { purchaseSummary, remainingBudget } from './purchases'
import type { Room } from './schema'

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' })
const sources = { offers: sampleOffers, variantLabels: sampleVariantLabels }
const entry = (variantId: string) => sampleCatalog.find((e) => e.variant.id === variantId)!

function withObjects(room: Room, ...objects: Room['objects']): Room {
  return { ...room, objects: [...room.objects, ...objects] }
}

describe('purchaseSummary', () => {
  it('lists purchases with line totals, counts owned furniture separately, and flags sample prices', () => {
    const lampEntry = entry('v-linen-floor-lamp-std')
    const room = withObjects(sampleRoom(), entryToObject(lampEntry, { id: 'lamp', position: { x: 0, z: 0 }, yaw: 0 }, 2))
    const summary = purchaseSummary(room, sources, usd(60000))
    expect(summary.lines).toEqual([
      {
        id: 'lamp',
        name: 'Linen Floor Lamp',
        variantLabel: 'Standard',
        quantity: 2,
        unitPrice: usd(14900),
        lineTotal: usd(29800),
        isSample: true,
        offerId: lampEntry.offer.id,
        store: 'Sample catalog',
        url: null,
        retrievedAt: lampEntry.offer.retrievedAt,
      },
    ])
    expect(summary.ownedCount).toBe(4)
    expect(summary.subtotal.total).toEqual(usd(29800))
    expect(summary.budget).toBe('under')
    expect(summary.anySample).toBe(true)
  })

  it('links each real purchase to its store listing and says when the price was read', () => {
    const lampEntry = entry('v-linen-floor-lamp-std')
    const real = { ...lampEntry.offer, id: 'offer:real', merchant: 'Schoolhouse', url: 'https://schoolhouse.com/products/isaac-floor-lamp?variant=1', isSample: false }
    const room = withObjects(sampleRoom(), { ...entryToObject(lampEntry, { id: 'lamp', position: { x: 0, z: 0 }, yaw: 0 }), offerId: real.id })
    const [line] = purchaseSummary(room, { offers: new Map([[real.id, real]]) }, null).lines
    expect(line).toMatchObject({ offerId: 'offer:real', store: 'Schoolhouse', url: real.url, retrievedAt: real.retrievedAt, isSample: false })
  })

  it('keeps an unknown price unknown in lines and in the budget', () => {
    const unpriced = entry('v-rattan-nightstand-std')
    const room = withObjects(sampleRoom(), entryToObject(unpriced, { id: 'ns', position: { x: 0, z: 0 }, yaw: 0 }))
    const summary = purchaseSummary(room, sources, usd(60000))
    expect(summary.lines[0]).toMatchObject({ unitPrice: null, lineTotal: null })
    expect(summary.subtotal.status).toBe('incomplete')
    expect(summary.budget).toBe('unknown')
  })

  it('treats a product whose offer is missing as unpriced', () => {
    const room = withObjects(sampleRoom(), { ...lamp(), offerId: 'nope' })
    expect(purchaseSummary(room, sources, null).subtotal.unpricedCount).toBe(1)
  })
})

describe('alternativeCategories', () => {
  it('maps captured categories to catalog categories that can stand in for them', () => {
    expect(alternativeCategories('table')).toEqual(['desk', 'coffee-table', 'dining-table', 'side-table', 'console'])
    expect(alternativeCategories('chair')).toEqual(['desk-chair', 'lounge-chair', 'dining-chair'])
    expect(alternativeCategories('storage')).toEqual(['dresser', 'nightstand', 'bookshelf', 'cabinet'])
    expect(alternativeCategories('floor-lamp')).toEqual(['floor-lamp'])
    expect(alternativeCategories('refrigerator')).toEqual([])
  })
})

describe('placementCommands', () => {
  it('swaps a selected object in place, keeping its id', () => {
    const room = sampleRoom()
    const commands = placementCommands(room, entry('v-mono-chair-std'), { mode: 'swap', objectId: 'OBJ-CHAIR' })!
    const result = applyCommands(room, commands, 'user')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const chair = result.room.objects.find((o) => o.id === 'OBJ-CHAIR')!
    expect(chair).toMatchObject({ name: 'Mono Chair', sourceKind: 'product', variantId: 'v-mono-chair-std' })
  })

  it('adds a new object at a free spot with a unique id', () => {
    const room = sampleRoom()
    const commands = placementCommands(room, entry('v-fiddle-plant-std'), { mode: 'add' })!
    expect(commands).toHaveLength(1)
    const result = applyCommands(room, commands, 'user')
    expect(result.ok).toBe(true)
    const again = placementCommands(result.ok ? result.room : room, entry('v-fiddle-plant-std'), { mode: 'add' })!
    const first = commands[0]!
    const second = again[0]!
    expect(first.type === 'add' && second.type === 'add' && first.object.id !== second.object.id).toBe(true)
  })

  it('lets a rug go under furniture', () => {
    const commands = placementCommands(sampleRoom(), entry('v-jute-rug-8x10'), { mode: 'add' })
    expect(commands).not.toBeNull()
    const result = applyCommands(sampleRoom(), commands!, 'user')
    expect(result.ok && result.warnings).toEqual([])
  })

  it('returns null when there is no free space for the size', () => {
    expect(placementCommands(sampleRoom(), entry('v-alder-bed-king'), { mode: 'add' })).toBeNull()
  })
})

describe('remainingBudget', () => {
  const room = sampleRoom()
  const withLamp = withObjects(room, entryToObject(entry('v-linen-floor-lamp-std'), { id: 'lamp', position: { x: 0, z: 0 }, yaw: 0 }))

  it('is the budget minus a complete subtotal, never below zero', () => {
    expect(remainingBudget(purchaseSummary(withLamp, sources, usd(60000)), usd(60000))).toEqual(usd(45100))
    expect(remainingBudget(purchaseSummary(withLamp, sources, usd(100)), usd(100))).toEqual(usd(0))
  })

  it('is unknown (null) without a budget or while any price is unknown', () => {
    expect(remainingBudget(purchaseSummary(withLamp, sources, null), null)).toBeNull()
    const unpriced = withObjects(withLamp, entryToObject(entry('v-rattan-nightstand-std'), { id: 'ns', position: { x: 1, z: 1 }, yaw: 0 }))
    expect(remainingBudget(purchaseSummary(unpriced, sources, usd(60000)), usd(60000))).toBeNull()
  })
})
