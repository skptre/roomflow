/**
 * The runtime catalog of real store listings. The snapshot is fetched once
 * (lazily, deduplicated, retryable), validated at this boundary, and expanded
 * into product / variant / offer entries. Offers live in one map that purchase
 * math reads; a price refresh replaces an offer there (an external fact, not a
 * room edit, so it is never an undo step).
 */
import { createStore, type StoreApi } from 'zustand/vanilla'
import type { CatalogEntry, CatalogQuery, CatalogResult, CatalogSource } from '../domain/catalog'
import { categoryInfo } from '../domain/categories'
import type { AssetRef, Offer } from '../domain/schema'
import { Snapshot } from '../shop/snapshot'

/** What renders a category until product-specific block recipes exist. */
function categoryAsset(category: string): AssetRef {
  const assemblyId = categoryInfo(category)?.assemblyId
  return assemblyId ? { kind: 'parametric', assemblyId } : { kind: 'placeholder' }
}

export function snapshotEntries(snapshot: Snapshot): CatalogEntry[] {
  return snapshot.products.flatMap((p) =>
    p.variants.map((v): CatalogEntry => ({
      product: {
        id: p.id,
        name: p.name,
        category: p.category,
        tags: p.tags,
        vendor: p.vendor,
        store: p.store,
        url: p.url,
        ...(p.imageUrl ? { imageUrl: p.imageUrl } : {}),
        optionNames: p.optionNames,
      },
      variant: {
        id: v.id,
        productId: p.id,
        label: v.label,
        dimensions: v.dimensions,
        asset: categoryAsset(p.category),
        optionValues: v.optionValues,
        ...(v.imageUrl ? { imageUrl: v.imageUrl } : {}),
      },
      offer: {
        id: `offer:${v.id}`,
        variantId: v.id,
        merchant: p.store,
        url: v.url,
        price: v.price,
        retrievedAt: snapshot.retrievedAt,
        isSample: false,
        available: v.available,
        sourceStore: p.storeDomain,
      },
    })),
  )
}

export type CatalogState = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  retrievedAt: string | null
  entries: CatalogEntry[]
  offers: ReadonlyMap<string, Offer>
  variantLabels: ReadonlyMap<string, string>
  /** Resolves when the snapshot is ready; concurrent calls share one request. Rejects on failure (call again to retry). */
  load: () => Promise<void>
  /** Store a newer offer (a refreshed price) wherever the old one was read. */
  updateOffer: (offer: Offer) => void
}

export function createCatalogStore(fetchSnapshot: () => Promise<unknown>): StoreApi<CatalogState> {
  let pending: Promise<void> | null = null
  return createStore<CatalogState>()((set, get) => ({
    status: 'idle',
    retrievedAt: null,
    entries: [],
    offers: new Map(),
    variantLabels: new Map(),
    load() {
      if (get().status === 'ready') return Promise.resolve()
      pending ??= (async () => {
        set({ status: 'loading' })
        try {
          const snapshot = Snapshot.parse(await fetchSnapshot())
          const entries = snapshotEntries(snapshot)
          set({
            status: 'ready',
            retrievedAt: snapshot.retrievedAt,
            entries,
            offers: new Map(entries.map((e) => [e.offer.id, e.offer])),
            variantLabels: new Map(entries.map((e) => [e.variant.id, e.variant.label])),
          })
        } catch (error) {
          set({ status: 'error' })
          throw error
        } finally {
          pending = null
        }
      })()
      return pending
    },
    updateOffer(offer) {
      const offers = new Map(get().offers)
      offers.set(offer.id, offer)
      set({ offers, entries: get().entries.map((e) => (e.offer.id === offer.id ? { ...e, offer } : e)) })
    },
  }))
}

/** Catalog queries answered from the loaded snapshot. */
export class SnapshotCatalogSource implements CatalogSource {
  private readonly store: StoreApi<CatalogState>
  constructor(store: StoreApi<CatalogState>) {
    this.store = store
  }

  async query(query: CatalogQuery): Promise<CatalogResult> {
    await this.store.getState().load()
    const all = this.store.getState().entries
    const categories = query.category
    const entries = categories ? all.filter((e) => categories.includes(e.product.category)) : all.slice()
    return { baseRevision: query.baseRevision, entries, source: 'snapshot' }
  }
}

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** Every word of the query appears somewhere in the listing's name, brand, store, tags, category, or variant. */
export function matchesSearch(entry: CatalogEntry, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const { product, variant } = entry
  const haystack = fold(
    [product.name, product.vendor, product.store, ...product.tags, categoryInfo(product.category)?.label, variant.label].filter(Boolean).join(' '),
  )
  return words.every((word) => haystack.includes(word))
}

/**
 * The variant for a set of chosen option values. With no exact match, keep
 * the option the user just changed (`changed`) and as many other choices as
 * possible; ties go to catalog order.
 */
export function pickVariant(variants: readonly { optionValues?: readonly string[] }[], chosen: readonly string[], changed?: number): number {
  let best = -1
  let bestScore = -1
  variants.forEach((variant, index) => {
    const values = variant.optionValues ?? []
    if (changed !== undefined && values[changed] !== chosen[changed]) return
    const score = chosen.reduce((sum, value, i) => sum + (values[i] === value ? 1 : 0), 0)
    if (score > bestScore) {
      best = index
      bestScore = score
    }
  })
  return Math.max(best, 0)
}
