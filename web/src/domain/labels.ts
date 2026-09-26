/** Short, honest labels for objects shown in tags and panels. */
import { purchaseLine, type PurchaseSources } from './designStore'
import { formatMoney } from './money'
import type { Dimensions, RoomObject } from './schema'

function centimeters(meters: number): string {
  return String(Math.round(meters * 1000) / 10)
}

/** Footprint first, then height: "160 × 210 × 95 cm" (width × depth × height). */
export function formatDimensions(dimensions: Pick<Dimensions, 'width' | 'height' | 'depth'>): string {
  return `${centimeters(dimensions.width)} × ${centimeters(dimensions.depth)} × ${centimeters(dimensions.height)} cm`
}

export type PriceLabel = { kind: 'owned' | 'price' | 'unknown'; text: string }

/** What this placed object adds to the purchase: nothing (yours), a price, or unknown. */
export function priceLabel(object: RoomObject, sources: PurchaseSources): PriceLabel {
  const line = purchaseLine(object, sources)
  if (line.owned) return { kind: 'owned', text: 'Yours' }
  if (!line.unitPrice) return { kind: 'unknown', text: 'Price unknown' }
  return {
    kind: 'price',
    text: formatMoney({ amountMinor: line.unitPrice.amountMinor * line.quantity, currency: line.unitPrice.currency }),
  }
}
