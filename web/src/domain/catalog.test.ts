import { describe, expect, it } from 'vitest'
import { sampleRoom } from '../test/rooms'
import { acceptResult, defaultVariantIndex, entryToObject, filterHard, preloadPicks, rankSoft, type CatalogEntry } from './catalog'

function entry(id: string, overrides: { category?: string; price?: number | null; currency?: string; width?: number; depth?: number; tags?: string[]; recipeId?: string } = {}): CatalogEntry {
  const { category = 'floor-lamp', price = 10000, currency = 'USD', width = 0.4, depth = 0.4, tags = [], recipeId = 'default:floor-lamp' } = overrides
  return {
    product: { id: `p-${id}`, name: `Product ${id}`, category, tags },
    variant: {
      id: `v-${id}`,
      productId: `p-${id}`,
      label: 'Standard',
      dimensions: { width, height: 1, depth, source: 'merchant' },
      asset: { kind: 'recipe', recipeId },
    },
    offer: {
      id: `o-${id}`,
      variantId: `v-${id}`,
      merchant: 'Sample catalog',
      price: price === null ? null : { amountMinor: price, currency },
      retrievedAt: '2026-09-26T00:00:00.000Z',
      isSample: true,
    },
  }
}

describe('filterHard', () => {
  const room = sampleRoom() // 4 × 3.5 m

  it('keeps only the requested categories', () => {
    const result = filterHard([entry('a'), entry('b', { category: 'rug' })], { category: ['rug'] }, room)
    expect(result.map((e) => e.product.id)).toEqual(['p-b'])
  })

  it('prunes items over the remaining budget', () => {
    const result = filterHard([entry('cheap', { price: 5000 }), entry('dear', { price: 50000 })], { budgetRemaining: { amountMinor: 20000, currency: 'USD' } }, room)
    expect(result.map((e) => e.product.id)).toEqual(['p-cheap'])
  })

  it('keeps unknown-price items (they are flagged, not assumed free or excluded)', () => {
    const result = filterHard([entry('mystery', { price: null })], { budgetRemaining: { amountMinor: 100, currency: 'USD' } }, room)
    expect(result).toHaveLength(1)
    expect(result[0]!.offer.price).toBeNull()
  })

  it('does not compare prices across currencies', () => {
    const result = filterHard([entry('eur', { price: 50000, currency: 'EUR' })], { budgetRemaining: { amountMinor: 100, currency: 'USD' } }, room)
    expect(result).toHaveLength(1)
  })

  it('prunes items too big for the floor in any orientation', () => {
    const result = filterHard([entry('huge', { width: 5, depth: 4 }), entry('long', { width: 3.8, depth: 0.5 })], {}, room)
    expect(result.map((e) => e.product.id)).toEqual(['p-long'])
  })
})

describe('rankSoft', () => {
  const items = [entry('a', { tags: ['minimal'] }), entry('b', { tags: ['warm', 'natural'] }), entry('c', { tags: ['warm'] })]

  it('puts better tag matches first without dropping anything', () => {
    const ranked = rankSoft(items, { tags: ['warm', 'natural'] })
    expect(ranked.map((e) => e.product.id)).toEqual(['p-b', 'p-c', 'p-a'])
  })

  it('recovers earlier options when preferences change', () => {
    const warm = rankSoft(items, { tags: ['warm'] })
    const minimal = rankSoft(warm, { tags: ['minimal'] })
    expect(minimal).toHaveLength(3)
    expect(minimal[0]!.product.id).toBe('p-a')
  })

  it('keeps variants of one product in catalog order', () => {
    const large = { ...entry('a'), variant: { ...entry('a').variant, id: 'v-a-large' } }
    const small = { ...entry('a'), variant: { ...entry('a').variant, id: 'v-a-small' } }
    expect(rankSoft([small, large], { tags: [] }).map((e) => e.variant.id)).toEqual(['v-a-small', 'v-a-large'])
  })

  it('is deterministic for ties', () => {
    expect(rankSoft(items, { tags: [] }).map((e) => e.product.id)).toEqual(['p-a', 'p-b', 'p-c'])
  })
})

describe('preloadPicks', () => {
  it('returns at most n entries with distinct assets', () => {
    const ranked = [entry('a'), entry('b'), entry('c', { recipeId: 'default:rug' }), entry('d', { recipeId: 'default:vase' })]
    const picks = preloadPicks(ranked, 2)
    expect(picks).toHaveLength(2)
    expect(new Set(picks.map((e) => JSON.stringify(e.variant.asset))).size).toBe(2)
  })
})

describe('acceptResult', () => {
  it('ignores a result computed for an older room revision', () => {
    const result = { baseRevision: 3, entries: [entry('a')], source: 'sample' as const }
    expect(acceptResult(result, 4)).toBeNull()
    expect(acceptResult(result, 3)).toEqual(result.entries)
  })
})

describe('entryToObject', () => {
  it('builds a purchasable placement that keeps variant, offer, listed size, and asset', () => {
    const object = entryToObject(entry('a'), { id: 'obj-1', position: { x: 0, z: 0 }, yaw: 0 }, 2)
    expect(object).toMatchObject({
      id: 'obj-1',
      sourceKind: 'product',
      variantId: 'v-a',
      offerId: 'o-a',
      quantity: 2,
      fidelity: 'approximate',
      dimensions: { width: 0.4, depth: 0.4, source: 'merchant' },
      asset: { kind: 'recipe', recipeId: 'default:floor-lamp' },
    })
  })
})

describe('defaultVariantIndex', () => {
  const entry = (category: string, width: number, source: 'merchant' | 'estimated' = 'merchant') =>
    ({
      product: { category },
      variant: { dimensions: { width, height: width * 0.75, depth: 0.04, source } },
      offer: {},
    }) as unknown as CatalogEntry

  it('starts a print sold in many sizes at the one nearest a typical painting, not the smallest', () => {
    const sizes = [0.254, 0.3556, 0.4572, 0.6096, 0.9144, 1.397].map((w) => entry('wall-art', w))
      expect(sizes[defaultVariantIndex(sizes)]!.variant.dimensions.width).toBeCloseTo(0.9144, 4)
  })

  it('keeps the first variant for floor pieces, single variants, and unlisted sizes', () => {
    expect(defaultVariantIndex([entry('sofa', 1.8), entry('sofa', 2.2)])).toBe(0)
    expect(defaultVariantIndex([entry('wall-art', 0.3)])).toBe(0)
    expect(defaultVariantIndex([entry('wall-art', 0.6, 'estimated'), entry('wall-art', 0.3, 'estimated')])).toBe(0)
  })
})
