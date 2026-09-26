import { describe, expect, it } from 'vitest'
import { normalizeProduct } from '../shop/normalize'
import fixtures from '../shop/__fixtures__/shopify-products.json'
import { ShopifyProduct } from '../shop/shopify'
import type { Snapshot } from '../shop/snapshot'
import { storeByDomain } from '../shop/stores'
import { createCatalogStore, matchesSearch, pickVariant, SnapshotCatalogSource, snapshotEntries } from './snapshotCatalog'

const AT = '2026-09-26T20:00:00.000Z'

function product(value: unknown, domain: string) {
  const result = normalizeProduct(ShopifyProduct.parse(structuredClone(value)), storeByDomain(domain)!)
  if (!('product' in result)) throw new Error('excluded')
  return result.product
}

const snapshot: Snapshot = {
  version: 1,
  retrievedAt: AT,
  stores: [],
  products: [product(fixtures.burrowSofa, 'www.burrow.com'), product(fixtures.curtain, 'halfpricedrapes.com'), product(fixtures.rug, 'loloirugs.com')],
}

describe('snapshotEntries', () => {
  it('expands products into product / variant / offer entries with real links', () => {
    const entries = snapshotEntries(snapshot)
    expect(entries).toHaveLength(snapshot.products.reduce((n, p) => n + p.variants.length, 0))
    const sofa = entries[0]!
    const raw = fixtures.burrowSofa
    expect(sofa.product).toMatchObject({ name: 'Nomad King Sofa', category: 'sofa', store: 'Burrow', vendor: 'Burrow', optionNames: ['Fabric', 'Leg Finish', 'Arm Style'] })
    expect(sofa.variant.productId).toBe(sofa.product.id)
    expect(sofa.variant.optionValues).toEqual(['Ivory - Performance Basketweave', 'Walnut - Wood', 'Block'])
    expect(sofa.offer).toEqual({
      id: `offer:${sofa.variant.id}`,
      variantId: sofa.variant.id,
      merchant: 'Burrow',
      url: `https://www.burrow.com/products/${raw.handle}?variant=${raw.variants[0]!.id}`,
      price: { amountMinor: 96400, currency: 'USD' },
      retrievedAt: AT,
      isSample: false,
      available: false,
      sourceStore: 'www.burrow.com',
    })
    // Until block recipes land, a category's stand-in assembly renders it.
    expect(sofa.variant.asset).toEqual({ kind: 'parametric', assemblyId: 'sofa' })
    const curtain = entries.find((e) => e.product.category === 'curtain')!
    expect(curtain.variant.asset).toEqual({ kind: 'placeholder' })
  })

  it('tags each entry with the moods its own words suggest, so looks can tell listings apart', () => {
    const entries = snapshotEntries(snapshot)
    const walnut = entries.find((e) => e.variant.label.includes('Walnut'))!
    const black = entries.find((e) => e.variant.label.includes('Black - Metal'))
    expect(walnut.product.tags).toContain('natural')
    if (black) expect(black.product.tags).toContain('minimal')
    expect(new Set(walnut.product.tags).size).toBe(walnut.product.tags.length)
  })

  it('keeps unknown prices unknown', () => {
    const rug = snapshotEntries(snapshot).find((e) => e.product.category === 'rug')!
    expect(rug.offer.price).toBeNull()
  })
})

describe('catalog store', () => {
  it('loads once for concurrent callers and indexes offers and labels', async () => {
    let calls = 0
    const store = createCatalogStore(async () => {
      calls += 1
      return snapshot
    })
    await Promise.all([store.getState().load(), store.getState().load()])
    expect(calls).toBe(1)
    const state = store.getState()
    expect(state.status).toBe('ready')
    expect(state.retrievedAt).toBe(AT)
    const first = state.entries[0]!
    expect(state.offers.get(first.offer.id)).toEqual(first.offer)
    expect(state.variantLabels.get(first.variant.id)).toBe(first.variant.label)
  })

  it('rejects an invalid snapshot and can retry', async () => {
    let attempt = 0
    const store = createCatalogStore(async () => (attempt++ === 0 ? ({ version: 2 } as unknown as Snapshot) : snapshot))
    await expect(store.getState().load()).rejects.toThrow()
    expect(store.getState().status).toBe('error')
    await store.getState().load()
    expect(store.getState().status).toBe('ready')
  })

  it('replaces a refreshed offer everywhere it is read', async () => {
    const store = createCatalogStore(async () => snapshot)
    await store.getState().load()
    const before = store.getState().entries[0]!.offer
    const refreshed = { ...before, price: { amountMinor: 99900, currency: 'USD' }, retrievedAt: '2026-09-27T01:00:00.000Z', available: true }
    store.getState().updateOffer(refreshed)
    expect(store.getState().offers.get(before.id)).toEqual(refreshed)
    expect(store.getState().entries[0]!.offer).toEqual(refreshed)
  })
})

describe('SnapshotCatalogSource', () => {
  it('answers queries from the snapshot, labeled as such, for the asked revision', async () => {
    const source = new SnapshotCatalogSource(createCatalogStore(async () => snapshot))
    const result = await source.query({ category: ['curtain'], baseRevision: 7 })
    expect(result.source).toBe('snapshot')
    expect(result.baseRevision).toBe(7)
    expect(result.entries.length).toBeGreaterThan(0)
    expect(result.entries.every((e) => e.product.category === 'curtain')).toBe(true)
  })

  it('fails the query when the snapshot cannot load (the panel offers a retry)', async () => {
    const source = new SnapshotCatalogSource(
      createCatalogStore(async () => {
        throw new Error('offline')
      }),
    )
    await expect(source.query({ baseRevision: 1 })).rejects.toThrow('offline')
  })
})

describe('matchesSearch', () => {
  const [sofa] = snapshotEntries(snapshot)

  it('matches every word across name, brand, store, tags, category and variant', () => {
    expect(matchesSearch(sofa!, 'nomad')).toBe(true)
    expect(matchesSearch(sofa!, 'burrow sofa walnut')).toBe(true)
    expect(matchesSearch(sofa!, 'SOFA  ivory')).toBe(true)
    expect(matchesSearch(sofa!, 'sofa velvet')).toBe(false)
    expect(matchesSearch(sofa!, '   ')).toBe(true)
  })

  it('ignores accents', () => {
    const entry = { ...sofa!, product: { ...sofa!.product, name: 'Bouclé Chair' } }
    expect(matchesSearch(entry, 'boucle')).toBe(true)
  })
})

describe('pickVariant', () => {
  const variants = [
    { optionValues: ['Ivory', 'Walnut', 'Block'] },
    { optionValues: ['Ivory', 'Oak', 'Block'] },
    { optionValues: ['Ivory', 'Oak', 'Slope'] },
    { optionValues: ['Moss', 'Walnut', 'Block'] },
  ]

  it('picks the variant with every chosen value', () => {
    expect(pickVariant(variants, ['Ivory', 'Oak', 'Slope'])).toBe(2)
  })

  it('when a change has no exact match, keeps the changed option and as many others as possible', () => {
    // Current: Ivory / Oak / Slope; change fabric to Moss → only Moss / Walnut / Block exists.
    expect(pickVariant(variants, ['Moss', 'Oak', 'Slope'], 0)).toBe(3)
    // Change legs to Walnut from Ivory / Oak / Slope → Ivory / Walnut / Block keeps fabric.
    expect(pickVariant(variants, ['Ivory', 'Walnut', 'Slope'], 1)).toBe(0)
  })
})
