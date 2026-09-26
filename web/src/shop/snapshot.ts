/**
 * The committed catalog snapshot (web/public/catalog/snapshot.json): real
 * store listings normalized once by scripts/harvest.ts and validated again
 * when the browser loads it. Products keep their variants inline so the file
 * stays compact; the catalog expands them into product/variant/offer entries.
 */
import { z } from 'zod'
import { Dimensions, Money } from '../domain/schema'

/** Links and photos render in the page, so only https URLs cross this boundary. */
const HttpsUrl = z.url({ protocol: /^https$/ })

/** Compact: id, link and label are derived from the product (see helpers below). */
export const SnapshotVariant = z.object({
  /** The store's variant id. */
  sid: z.number().int().positive(),
  /** Values in the product's option order; empty for a single default variant. */
  optionValues: z.array(z.string()),
  dimensions: Dimensions,
  /** Only when this variant has its own photo (otherwise the product's). */
  imageUrl: HttpsUrl.optional(),
  /** null = unknown (unparseable, placeholder, or not listed). Never zero-for-unknown. */
  price: Money.nullable(),
  available: z.boolean(),
})
export type SnapshotVariant = z.infer<typeof SnapshotVariant>

export const SnapshotProduct = z.object({
  /** shop:<domain>:<productId> */
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  tags: z.array(z.string()),
  vendor: z.string(),
  store: z.string().min(1),
  storeDomain: z.string().min(1),
  handle: z.string().min(1),
  url: HttpsUrl,
  imageUrl: HttpsUrl.optional(),
  optionNames: z.array(z.string()),
  variants: z.array(SnapshotVariant).min(1),
})
export type SnapshotProduct = z.infer<typeof SnapshotProduct>

export const Snapshot = z.object({
  version: z.literal(1),
  retrievedAt: z.iso.datetime(),
  stores: z.array(z.object({ domain: z.string(), name: z.string(), products: z.number().int().nonnegative(), errors: z.array(z.string()) })),
  products: z.array(SnapshotProduct),
})
export type Snapshot = z.infer<typeof Snapshot>

/** shop:<domain>:<productId>:<variantId> */
export function variantId(product: Pick<SnapshotProduct, 'id'>, variant: Pick<SnapshotVariant, 'sid'>): string {
  return `${product.id}:${variant.sid}`
}

/** The exact variant page: https://<domain>/products/<handle>?variant=<id> */
export function variantUrl(product: Pick<SnapshotProduct, 'url'>, variant: Pick<SnapshotVariant, 'sid'>): string {
  return `${product.url}?variant=${variant.sid}`
}

/** "Ivory / Walnut - Wood", or "Standard" for a product sold one way. */
export function variantLabel(variant: Pick<SnapshotVariant, 'optionValues'>): string {
  return variant.optionValues.filter(Boolean).join(' / ') || 'Standard'
}
