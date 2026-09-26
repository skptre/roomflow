import { describe, expect, it } from 'vitest'
import { Dimensions, Offer, Room } from './schema'

const dims = { width: 1, height: 1, depth: 1, source: 'captured' as const }

describe('Dimensions', () => {
  it('accepts positive finite sizes', () => {
    expect(Dimensions.safeParse(dims).success).toBe(true)
  })

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['zero', 0],
    ['negative', -0.5],
  ])('rejects %s', (_label, value) => {
    expect(Dimensions.safeParse({ ...dims, width: value }).success).toBe(false)
  })
})

describe('Offer', () => {
  const offer = {
    id: 'o1',
    variantId: 'v1',
    merchant: 'Sample catalog',
    retrievedAt: '2026-09-26T00:00:00.000Z',
    isSample: true,
  }

  it('accepts an unknown price as null', () => {
    const parsed = Offer.safeParse({ ...offer, price: null })
    expect(parsed.success).toBe(true)
    expect(parsed.data?.price).toBeNull()
  })

  it('rejects a minor-unit price beyond the safe integer range', () => {
    expect(Offer.safeParse({ ...offer, price: { amountMinor: 2 ** 53, currency: 'USD' } }).success).toBe(false)
  })

  it('rejects a fractional minor-unit price', () => {
    expect(Offer.safeParse({ ...offer, price: { amountMinor: 10.5, currency: 'USD' } }).success).toBe(false)
  })
})

describe('Room', () => {
  const room = {
    id: 'r1',
    name: 'Bedroom',
    floorPolygon: [
      { x: 0, z: 0 },
      { x: 4, z: 0 },
      { x: 4, z: 3 },
    ],
    walls: [{ id: 'w1', start: { x: 0, z: 0 }, end: { x: 4, z: 0 }, height: 2.5, thickness: 0.12, exterior: true }],
    openings: [{ id: 'd1', kind: 'door', wallId: 'w1', offsetAlongWall: 1, bottom: 0, width: 0.9, height: 2 }],
    objects: [],
    finishes: { wall: '#f4efe8', floor: '#c9a882' },
    source: { kind: 'synthetic', importedAt: '2026-09-26T00:00:00.000Z', raw: { any: 'thing' } },
  }

  it('accepts a consistent room', () => {
    expect(Room.safeParse(room).success).toBe(true)
  })

  it('rejects an opening that references an unknown wall', () => {
    const bad = { ...room, openings: [{ ...room.openings[0], wallId: 'missing' }] }
    expect(Room.safeParse(bad).success).toBe(false)
  })
})
