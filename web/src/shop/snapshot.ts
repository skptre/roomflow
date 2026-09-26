/**
 * The committed catalog snapshot (web/public/catalog/snapshot.json): real
 * store listings normalized once by scripts/harvest.ts and validated again
 * when the browser loads it. Products keep their variants inline so the file
 * stays compact; the catalog expands them into product/variant/offer entries.
 */
import { z } from 'zod'
import { Dimensions, Money } from '../domain/schema'

export const SnapshotVariant = z.object({
  /** shop:<domain>:<productId>:<variantId> */
  id: z.string().min(1),
  label: z.string().min(1),
  /** Values in the product's option order; empty for a single default variant. */
  optionValues: z.array(z.string()),
  dimensions: Dimensions,
  imageUrl: z.url().optional(),
  /** Exact variant page: https://<domain>/products/<handle>?variant=<id> */
  url: z.url(),
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
  url: z.url(),
  imageUrl: z.url().optional(),
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
