import { describe, expect, it } from 'vitest'
import { sizedPhoto } from './photo'

describe('sizedPhoto', () => {
  it('asks the Shopify CDN for a resized copy, keeping the version', () => {
    expect(sizedPhoto('https://cdn.shopify.com/s/files/1/a.jpg?v=12', 1024)).toBe('https://cdn.shopify.com/s/files/1/a.jpg?v=12&width=1024')
    expect(sizedPhoto('https://cdn.shopify.com/s/files/1/a.jpg?width=300', 1024)).toBe('https://cdn.shopify.com/s/files/1/a.jpg?width=1024')
  })
  it('leaves other hosts and bad URLs alone', () => {
    expect(sizedPhoto('https://example.com/a.jpg', 1024)).toBe('https://example.com/a.jpg')
    expect(sizedPhoto('not a url', 1024)).toBe('not a url')
  })
})
