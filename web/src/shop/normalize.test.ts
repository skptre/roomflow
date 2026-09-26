import { describe, expect, it } from 'vitest'
import fixtures from './__fixtures__/shopify-products.json'
import { normalizeProduct } from './normalize'
import { ShopifyProduct } from './shopify'
import { SnapshotProduct, variantId, variantLabel, variantUrl } from './snapshot'
import { storeByDomain } from './stores'

const IN = 0.0254
const raw = (value: unknown) => ShopifyProduct.parse(structuredClone(value))
const store = (domain: string) => storeByDomain(domain)!

function normalized(value: unknown, domain: string) {
  const result = normalizeProduct(raw(value), store(domain))
  if (!('product' in result)) throw new Error(`excluded: ${result.excluded}`)
  expect(SnapshotProduct.safeParse(result.product).success).toBe(true)
  return result.product
}

describe('normalizeProduct', () => {
  it('builds stable ids, variant labels and exact variant links (Burrow sofa)', () => {
    const src = fixtures.burrowSofa
    const product = normalized(src, 'www.burrow.com')
    expect(product.id).toBe(`shop:www.burrow.com:${src.id}`)
    expect(product.category).toBe('sofa')
    expect(product.store).toBe('Burrow')
    expect(product.vendor).toBe('Burrow')
    expect(product.url).toBe(`https://www.burrow.com/products/${src.handle}`)
    expect(product.optionNames).toEqual(['Fabric', 'Leg Finish', 'Arm Style'])
    const v = product.variants[0]!
    const rv = src.variants[0]!
    expect(v.sid).toBe(rv.id)
    expect(variantId(product, v)).toBe(`shop:www.burrow.com:${src.id}:${rv.id}`)
    expect(variantLabel(v)).toBe('Ivory - Performance Basketweave / Walnut - Wood / Block')
    expect(v.optionValues).toEqual(['Ivory - Performance Basketweave', 'Walnut - Wood', 'Block'])
    expect(variantUrl(product, v)).toBe(`https://www.burrow.com/products/${src.handle}?variant=${rv.id}`)
    expect(v.price).toEqual({ amountMinor: 96400, currency: 'USD' })
    expect(v.available).toBe(false)
    expect(product.variants.map((x) => x.sid)).toHaveLength(new Set(product.variants.map((x) => x.sid)).size)
  })

  it('marks size estimated when the listing gives none', () => {
    const v = normalized(fixtures.burrowSofa, 'www.burrow.com').variants[0]!
    expect(v.dimensions).toEqual({ width: 2.0, height: 0.85, depth: 0.9, source: 'estimated' })
  })

  it('uses merchant overall dimensions from the description', () => {
    const product = normalized(fixtures.polyAndBarkSectional, 'polyandbark.com')
    expect(product.category).toBe('sectional')
    const d = product.variants[0]!.dimensions
    expect(d.source).toBe('merchant')
    expect(d.width).toBeCloseTo(113.5 * IN, 6)
    expect(d.depth).toBeCloseTo(66.25 * IN, 6)
    expect(d.height).toBeCloseTo(35 * IN, 6)
    expect(product.variants[0]!.price).toEqual({ amountMinor: 449700, currency: 'USD' })
  })

  it('reads each curtain variant size from its option (a different size is a different variant)', () => {
    const product = normalized(fixtures.curtain, 'halfpricedrapes.com')
    expect(product.category).toBe('curtain')
    const [a, b] = product.variants
    expect(a!.dimensions.width).toBeCloseTo(50 * IN, 6)
    expect(a!.dimensions.height).toBeCloseTo(84 * IN, 6)
    expect(b!.dimensions.height).toBeCloseTo(96 * IN, 6)
    // Panel thickness is not listed, so the size as a whole is an estimate.
    expect(a!.dimensions.source).toBe('estimated')
  })

  it('reads print sizes per variant', () => {
    const product = normalized(fixtures.artPrint, 'juniperprintshop.com')
    expect(product.category).toBe('wall-art')
    expect(product.variants[0]!.dimensions.width).toBeCloseTo(8 * IN, 6)
    expect(product.variants[0]!.dimensions.height).toBeCloseTo(10 * IN, 6)
    expect(product.variants[0]!.price).toEqual({ amountMinor: 2900, currency: 'USD' })
    // 14 in = 0.35559999999999997 in floating point; stored to the micrometer instead.
    expect(product.variants[1]!.dimensions.height).toBe(0.3556)
  })

  it("never shows a store's placeholder price (Loloi lists 99999.00)", () => {
    const product = normalized(fixtures.rug, 'loloirugs.com')
    expect(product.category).toBe('rug')
    expect(product.variants.every((v) => v.price === null)).toBe(true)
    expect(product.variants[0]!.dimensions.width).toBeCloseTo(21 * IN, 6)
    expect(product.variants[0]!.dimensions.depth).toBeCloseTo(34 * IN, 6)
  })

  it('treats a 0.00 price on a room object as unknown, not free', () => {
    const src = structuredClone(fixtures.artPrint)
    src.variants[0]!.price = '0.00'
    expect(normalized(src, 'juniperprintshop.com').variants[0]!.price).toBeNull()
  })

  it('labels a single default variant plainly and keeps the product photo', () => {
    const src = structuredClone(fixtures.polyAndBarkSectional)
    src.options = [{ name: 'Title', position: 1, values: ['Default Title'] }]
    src.variants[0] = { ...src.variants[0]!, title: 'Default Title', option1: 'Default Title', featured_image: null }
    const product = normalized(src, 'polyandbark.com')
    expect(product.optionNames).toEqual([])
    expect(variantLabel(product.variants[0]!)).toBe('Standard')
    expect(product.variants[0]!.optionValues).toEqual([])
    // Same photo as the product: not repeated per variant.
    expect(product.imageUrl).toBe(src.images[0]!.src)
    expect(product.variants[0]!.imageUrl).toBeUndefined()
  })

  it('prefers the variant photo over the product photo', () => {
    const src = fixtures.burrowSofa
    const v = normalized(src, 'www.burrow.com').variants[0]!
    expect(v.imageUrl).toBe(src.variants[0]!.featured_image!.src)
  })

  it('reads a furniture width stated in the product name', () => {
    const src = structuredClone(fixtures.polyAndBarkSectional)
    src.body_html = ''
    src.title = 'Kova Pillow Cushion Sofa 86"'
    src.product_type = 'Sofa'
    const d = normalized(src, 'polyandbark.com').variants[0]!.dimensions
    expect(d.width).toBeCloseTo(86 * IN, 6)
    expect(d.source).toBe('estimated')
    // Not for rugs, art or curtains, whose names may quote other measures.
    const rug = structuredClone(fixtures.artPrint)
    rug.title = 'Vintage Pillow No. 216, 22" x 22"'
    expect(normalized(rug, 'juniperprintshop.com').variants[0]!.dimensions.width).toBeCloseTo(8 * IN, 6)
  })

  it('drops a photo that is not https instead of failing the snapshot', () => {
    const src = structuredClone(fixtures.burrowSofa)
    src.images[0]!.src = 'http://cdn.shopify.com/s/files/1/plain.jpg'
    src.variants[0]!.featured_image = { src: 'http://cdn.shopify.com/s/files/1/variant.jpg' }
    const product = normalized(src, 'www.burrow.com')
    expect(product.imageUrl).toBeUndefined()
    expect(product.variants[0]!.imageUrl).toBeUndefined()
  })

  it('drops an implausible listed size instead of trusting it', () => {
    const src = structuredClone(fixtures.polyAndBarkSectional)
    src.title = 'Harper Leather Sleeper Sectional'
    src.body_html = 'Overall Product Dimensions: 1135" W × 66" D × 35" H'
    const d = normalized(src, 'polyandbark.com').variants[0]!.dimensions
    expect(d.source).toBe('estimated')
    expect(d.width).toBe(2.8)
  })

  it('keeps short readable tags and drops internal ones', () => {
    const product = normalized(fixtures.burrowSofa, 'www.burrow.com')
    expect(product.tags).toContain('living')
    expect(product.tags.some((t) => t.includes('_'))).toBe(false)
  })

  it('reports why a listing was excluded', () => {
    const src = structuredClone(fixtures.artPrint)
    src.product_type = 'Swatch'
    expect(normalizeProduct(raw(src), store('juniperprintshop.com'))).toEqual({ excluded: 'swatch-or-sample' })
  })
})
