import { describe, expect, it } from 'vitest'
import { lamp, sampleRoom } from '../test/rooms'
import { formatDimensions, priceLabel } from './labels'
import type { Offer } from './schema'

const offer: Offer = {
  id: 'o-lamp',
  variantId: 'v-lamp',
  merchant: 'Sample catalog',
  price: { amountMinor: 8900, currency: 'USD' },
  retrievedAt: '2026-09-26T00:00:00.000Z',
  isSample: true,
}

describe('formatDimensions', () => {
  it('shows width × depth × height in centimeters', () => {
    expect(formatDimensions({ width: 1.6, height: 0.95, depth: 2.1 })).toBe('160 × 210 × 95 cm')
  })

  it('keeps one decimal for small items', () => {
    expect(formatDimensions({ width: 0.184, height: 0.3, depth: 0.18 })).toBe('18.4 × 18 × 30 cm')
  })
})

describe('priceLabel', () => {
  it('calls existing furniture yours, with no price', () => {
    const bed = sampleRoom().objects.find((o) => o.id === 'OBJ-BED')!
    expect(priceLabel(bed, { offers: new Map() })).toEqual({ kind: 'owned', text: 'Yours' })
  })

  it('shows the chosen offer price times quantity', () => {
    expect(priceLabel({ ...lamp(), quantity: 2 }, { offers: new Map([['o-lamp', offer]]) })).toEqual({
      kind: 'price',
      text: '$178.00',
    })
  })

  it('says the price is unknown instead of showing zero', () => {
    expect(priceLabel(lamp(), { offers: new Map([['o-lamp', { ...offer, price: null }]]) })).toEqual({
      kind: 'unknown',
      text: 'Price unknown',
    })
    expect(priceLabel(lamp(), { offers: new Map() })).toEqual({ kind: 'unknown', text: 'Price unknown' })
  })

  it('does not use an offer that belongs to another variant', () => {
    expect(priceLabel({ ...lamp(), variantId: 'v-other' }, { offers: new Map([['o-lamp', offer]]) }).kind).toBe('unknown')
  })
})
