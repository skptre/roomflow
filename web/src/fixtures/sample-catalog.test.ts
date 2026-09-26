import { describe, expect, it } from 'vitest'
import { Offer, Product, Variant } from '../domain/schema'
import { assemblies } from './assemblies'
import { sampleCatalog } from './sample-catalog'

describe('sample catalog', () => {
  it('has about forty products with one to three variants each', () => {
    const products = new Set(sampleCatalog.map((entry) => entry.product.id))
    expect(products.size).toBeGreaterThanOrEqual(38)
    for (const id of products) {
      const variants = sampleCatalog.filter((entry) => entry.product.id === id)
      expect(variants.length).toBeGreaterThanOrEqual(1)
      expect(variants.length).toBeLessThanOrEqual(3)
    }
  })

  it('validates against the shared schemas', () => {
    for (const { product, variant, offer } of sampleCatalog) {
      expect(Product.safeParse(product).success).toBe(true)
      expect(Variant.safeParse(variant).success).toBe(true)
      expect(Offer.safeParse(offer).success).toBe(true)
      expect(variant.productId).toBe(product.id)
      expect(offer.variantId).toBe(variant.id)
    }
  })

  it('is honest about being sample data: no links, sample merchant, flagged offers', () => {
    for (const { offer } of sampleCatalog) {
      expect(offer.url).toBeUndefined()
      expect(offer.isSample).toBe(true)
      expect(offer.merchant).toBe('Sample catalog')
    }
  })

  it('includes exactly one item with an unknown price', () => {
    expect(sampleCatalog.filter((entry) => entry.offer.price === null)).toHaveLength(1)
  })

  it('has unique variant and offer ids', () => {
    expect(new Set(sampleCatalog.map((e) => e.variant.id)).size).toBe(sampleCatalog.length)
    expect(new Set(sampleCatalog.map((e) => e.offer.id)).size).toBe(sampleCatalog.length)
  })

  it('uses existing assemblies, and every recolor targets a color the assembly actually has', () => {
    for (const { variant } of sampleCatalog) {
      expect(variant.asset.kind).toBe('parametric')
      if (variant.asset.kind !== 'parametric') continue
      const assembly = assemblies[variant.asset.assemblyId]
      expect(assembly, variant.asset.assemblyId).toBeDefined()
      const colors = new Set(assembly!.parts.map((part) => part.color.toLowerCase()))
      for (const from of Object.keys(variant.asset.recolor ?? {})) expect(colors.has(from), `${variant.id} ${from}`).toBe(true)
    }
  })

  it('gives different sizes as different variants with different prices', () => {
    const beds = sampleCatalog.filter((e) => e.product.id === 'p-alder-bed')
    expect(beds.length).toBeGreaterThan(1)
    expect(new Set(beds.map((e) => e.variant.dimensions.width)).size).toBe(beds.length)
  })
})
