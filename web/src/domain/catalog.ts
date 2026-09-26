/**
 * Catalog retrieval shape (progressive narrowing): a source returns candidates,
 * hard constraints prune (category, fits the floor, affordable when the price
 * is known), soft preferences rerank (theme tags) so changing taste recovers
 * earlier options, and only a few top picks are prepared ahead of time.
 * Retrieval, ranking, and asset preparation stay separate steps.
 */
import type { Command } from './commands'
import { footprintBounds } from './geometry'
import { freeSpot } from './layout'
import type { Money, Offer, Product, Room, RoomObject, Variant, Vec2 } from './schema'

/** One purchasable choice: a product, one of its variants, and the offer that prices it. */
export type CatalogEntry = { product: Product; variant: Variant; offer: Offer }

export type CatalogQuery = {
  roomType?: string
  category?: string[]
  /** Remaining purchase budget; items known to cost more are pruned. */
  budgetRemaining?: Money | null
  themeId?: string
  nearObjectId?: string
  /** The committed room revision the query was made for. */
  baseRevision: number
}

export type CatalogResult = {
  baseRevision: number
  entries: CatalogEntry[]
  /** Where the entries came from. Sample data is always labeled as such in the UI. */
  source: 'sample' | 'live'
}

/** Anything that can answer catalog queries: the sample fixture now, live search later. */
export interface CatalogSource {
  query(query: CatalogQuery): Promise<CatalogResult>
}

/** Hard constraints. Unknown prices are kept (and shown as unknown), never treated as free or excluded. */
export function filterHard(entries: readonly CatalogEntry[], query: Omit<CatalogQuery, 'baseRevision'>, room: Room): CatalogEntry[] {
  const bounds = footprintBounds(room.floorPolygon)
  const roomW = bounds.maxX - bounds.minX
  const roomD = bounds.maxZ - bounds.minZ
  const budget = query.budgetRemaining ?? null
  return entries.filter(({ product, variant, offer }) => {
    if (query.category && !query.category.includes(product.category)) return false
    const { width, depth } = variant.dimensions
    const fits = (width <= roomW && depth <= roomD) || (width <= roomD && depth <= roomW)
    if (!fits) return false
    if (budget && offer.price && offer.price.currency === budget.currency && offer.price.amountMinor > budget.amountMinor) {
      return false
    }
    return true
  })
}

export type Preferences = { tags: readonly string[] }

/** Soft preferences: reorder by how many preferred tags match; ties order by product id, keeping each product's variants in catalog order. */
export function rankSoft(entries: readonly CatalogEntry[], preferences: Preferences): CatalogEntry[] {
  const wanted = new Set(preferences.tags)
  const score = (entry: CatalogEntry) => entry.product.tags.reduce((sum, tag) => sum + (wanted.has(tag) ? 1 : 0), 0)
  return entries
    .map((entry) => ({ entry, score: score(entry) }))
    .sort((a, b) => b.score - a.score || a.entry.product.id.localeCompare(b.entry.product.id))
    .map(({ entry }) => entry)
}

/** The first few entries with distinct visual assets — what is worth preparing before the user asks. */
export function preloadPicks(ranked: readonly CatalogEntry[], n = 3): CatalogEntry[] {
  const seen = new Set<string>()
  const picks: CatalogEntry[] = []
  for (const entry of ranked) {
    if (picks.length >= n) break
    const key = JSON.stringify(entry.variant.asset)
    if (seen.has(key)) continue
    seen.add(key)
    picks.push(entry)
  }
  return picks
}

/** Use a result only if it was computed for the current committed revision. */
export function acceptResult(result: CatalogResult, currentRevision: number): CatalogEntry[] | null {
  return result.baseRevision === currentRevision ? result.entries : null
}

/** A placed product built from a catalog entry: listed size, variant asset, and the chosen offer. */
export function entryToObject(entry: CatalogEntry, placement: { id: string; position: Vec2; yaw: number }, quantity = 1): RoomObject {
  return {
    id: placement.id,
    name: entry.product.name,
    category: entry.product.category,
    sourceKind: 'product',
    dimensions: entry.variant.dimensions,
    pose: { position: { x: placement.position.x, y: 0, z: placement.position.z }, yaw: placement.yaw },
    asset: entry.variant.asset,
    fidelity: 'approximate',
    variantId: entry.variant.id,
    offerId: entry.offer.id,
    quantity,
    keep: false,
    lockPlacement: false,
  }
}

export type PlacementTarget = { mode: 'swap'; objectId: string } | { mode: 'add'; near?: Vec2 }

/** A fresh, readable object id for a new placement of this variant. */
function newObjectId(room: Room, entry: CatalogEntry): string {
  const taken = new Set(room.objects.map((object) => object.id))
  for (let n = 1; ; n++) {
    const id = `${entry.variant.id}#${n}`
    if (!taken.has(id)) return id
  }
}

/**
 * Commands that put a catalog entry in the room: swap it in for an existing
 * object (same id and spot), or add it at the nearest free spot. Returns null
 * when there is no free space for its size.
 */
export function placementCommands(room: Room, entry: CatalogEntry, target: PlacementTarget, quantity = 1): Command[] | null {
  if (target.mode === 'swap') {
    const current = room.objects.find((object) => object.id === target.objectId)
    if (!current) return null
    const { id: _id, pose: _pose, ...replacement } = entryToObject(entry, { id: current.id, position: { x: 0, z: 0 }, yaw: 0 }, quantity)
    return [{ type: 'replace', id: current.id, with: replacement }]
  }
  const pose = freeSpot(room, entry.variant.dimensions, { near: target.near })
  if (!pose) return null
  const object = entryToObject(entry, { id: newObjectId(room, entry), position: { x: pose.position.x, z: pose.position.z }, yaw: pose.yaw }, quantity)
  return [{ type: 'add', object }]
}
