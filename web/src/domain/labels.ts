/** Short, honest labels for objects shown in tags and panels. */
import { purchaseLine, type PurchaseSources } from './designStore'
import { formatMoney } from './money'
import type { Dimensions, MeasurementSource, RoomObject } from './schema'

function centimeters(meters: number): string {
  return String(Math.round(meters * 1000) / 10)
}

/** A single length for display: "95 cm". */
export function formatLength(meters: number): string {
  return `${centimeters(meters)} cm`
}

const FACES: Readonly<Record<string, readonly ['width', 'height' | 'depth']>> = {
  'wall-art': ['width', 'height'],
  mirror: ['width', 'height'],
  curtain: ['width', 'height'],
  closet: ['width', 'height'],
  rug: ['width', 'depth'],
}

/** The two axes that are a flat thing's size (a print's width × height, a rug's width × length); null for furniture. */
export function faceAxes(category: string | undefined): readonly ['width', 'height' | 'depth'] | null {
  return category && Object.hasOwn(FACES, category) ? FACES[category]! : null
}

/**
 * Footprint first, then height: "160 × 210 × 95 cm" (width × depth × height).
 * Flat things show only their face ("61 × 91.4 cm"): their thickness is never listed.
 */
export function formatDimensions(dimensions: Pick<Dimensions, 'width' | 'height' | 'depth'>, category?: string): string {
  const face = faceAxes(category)
  if (face) return `${centimeters(dimensions[face[0]])} × ${centimeters(dimensions[face[1]])} cm`
  return `${centimeters(dimensions.width)} × ${centimeters(dimensions.depth)} × ${centimeters(dimensions.height)} cm`
}

const PROVENANCE: Record<MeasurementSource, string> = {
  captured: 'measured',
  merchant: 'listed',
  user: 'you measured',
  estimated: 'estimated',
  unknown: 'unknown',
}

/** Where a size came from, in words a person would use. */
export function provenanceLabel(source: MeasurementSource): string {
  return PROVENANCE[source]
}

/** A size with its source: "160 × 210 × 95 cm · listed", or "≈ … · estimated" when it is not a measurement. */
export function formatSizeWithSource(dimensions: Dimensions, category?: string): string {
  const measured = dimensions.source === 'merchant' || dimensions.source === 'captured' || dimensions.source === 'user'
  return `${measured ? '' : '≈ '}${formatDimensions(dimensions, category)} · ${provenanceLabel(dimensions.source)}`
}

export type PriceLabel ={ kind: 'owned' | 'price' | 'unknown'; text: string }

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
