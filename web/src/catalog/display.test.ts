import { describe, expect, it } from 'vitest'
import type { CatalogEntry } from '../domain/catalog'
import { matchesMood, sizedImage } from './display'

function entry(name: string, label = 'Standard', tags: string[] = []): CatalogEntry {
  return {
    product: { id: 'p', name, category: 'sofa', tags },
    variant: { id: 'v', productId: 'p', label, dimensions: { width: 1, height: 1, depth: 1, source: 'estimated' }, asset: { kind: 'placeholder' } },
    offer: { id: 'o', variantId: 'v', merchant: 'Burrow', price: null, retrievedAt: '2026-09-26T19:28:27.651Z', isSample: false },
  }
}

describe('sizedImage', () => {
  it('asks the Shopify CDN for a small rendition', () => {
    expect(sizedImage('https://cdn.shopify.com/s/files/1/a.jpg?v=17', 240)).toBe('https://cdn.shopify.com/s/files/1/a.jpg?v=17&width=240')
    expect(sizedImage('https://cdn.shopify.com/s/files/1/a.jpg', 480)).toBe('https://cdn.shopify.com/s/files/1/a.jpg?width=480')
    expect(sizedImage('https://cdn.shopify.com/s/files/1/a.jpg?width=1000&v=1', 240)).toBe('https://cdn.shopify.com/s/files/1/a.jpg?width=240&v=1')
  })

  it('leaves other hosts alone', () => {
    expect(sizedImage('https://example.com/a.jpg', 240)).toBe('https://example.com/a.jpg')
  })
})

describe('matchesMood', () => {
  it('matches every listing for no mood', () => {
    expect(matchesMood(entry('Anything'), '')).toBe(true)
  })

  it('reads materials and colors from the name, variant and tags', () => {
    expect(matchesMood(entry('Nomad Sofa', 'Ivory / Walnut - Wood'), 'natural')).toBe(true)
    expect(matchesMood(entry('Vera Chair - Deep Pile Mohair'), 'cozy')).toBe(true)
    expect(matchesMood(entry('Lodge Chair', 'Standard', ['boucle']), 'cozy')).toBe(true)
    expect(matchesMood(entry('Petite Bouclé Throw'), 'cozy')).toBe(true)
    expect(matchesMood(entry('Arlo Chair', 'Black Metal'), 'minimal')).toBe(true)
    expect(matchesMood(entry('Kova Sofa', 'Dark Teal Performance Velvet'), 'colorful')).toBe(true)
  })

  it('does not match on unrelated words', () => {
    expect(matchesMood(entry('Kova Sofa', 'Dark Teal Performance Velvet'), 'natural')).toBe(false)
    // "oaken" is not oak; "redwood" is not red.
    expect(matchesMood(entry('Oaken Stool'), 'natural')).toBe(false)
    expect(matchesMood(entry('Redwood Planter'), 'colorful')).toBe(false)
  })
})
