/**
 * The runtime catalog of real store listings. The snapshot is fetched once
 * (lazily, deduplicated, retryable), validated at this boundary, and expanded
 * into product / variant / offer entries. Offers live in one map that purchase
 * math reads; a price refresh replaces an offer there (an external fact, not a
 * room edit, so it is never an undo step).
 */
import { createStore, type StoreApi } from 'zustand/vanilla'
import type { CatalogEntry, CatalogQuery, CatalogResult, CatalogSource } from '../domain/catalog'
import { getFamily } from '../blocks/families'
import { validateRecipe, variantBlocks, variantColors, type Recipe } from '../blocks/recipe'
import { recipeAsset, registerRecipes } from '../blocks/registry'
import { categoryInfo } from '../domain/categories'
import type { AssetRef, Offer } from '../domain/schema'
import { Snapshot, variantId, variantLabel, variantUrl } from '../shop/snapshot'
import { moodsOf } from './display'

/**
 * How one variant is drawn: its product's recipe in this variant's colors and
 * block choices (and, for rugs and art, its own photo), else the category's
 * default recipe.
 */
function variantAsset(p: Snapshot['products'][number], sv: Snapshot['products'][number]['variants'][number], recipe: Recipe | undefined): AssetRef {
  if (!recipe) return recipeAsset(p.category)
  const colors = variantColors(recipe, p.optionNames, sv.optionValues)
  const blocks = variantBlocks(recipe, p.optionNames, sv.optionValues)
  // A variant's own photo replaces the product photo only where the recipe shows the product photo.
  const ownPhoto = getFamily(recipe.family)?.imageSlot && recipe.image?.url === p.imageUrl && sv.imageUrl ? sv.imageUrl : undefined
  return {
    kind: 'recipe',
    recipeId: recipe.id,
    ...(colors ? { colors } : {}),
    ...(blocks ? { blocks } : {}),
    ...(ownPhoto ? { imageUrl: ownPhoto } : {}),
  }
}

export function snapshotEntries(snapshot: Snapshot, recipes: ReadonlyMap<string, Recipe> = new Map()): CatalogEntry[] {
  return snapshot.products.flatMap((p) =>
    p.variants.map((sv): CatalogEntry => {
      const v = { ...sv, id: variantId(p, sv), label: variantLabel(sv), url: variantUrl(p, sv), imageUrl: sv.imageUrl ?? p.imageUrl }
      // Store tags carry no mood; the listing's own material and color words do (for looks and ranking).
      const tags = [...new Set([...p.tags, ...moodsOf([p.name, v.label, ...p.tags])])]
      return {
        product: {
          id: p.id,
          name: p.name,
          category: p.category,
          tags,
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
          asset: variantAsset(p, sv, recipes.get(p.id)),
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
      }
    }),
  )
}

export type CatalogState = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  retrievedAt: string | null
  entries: CatalogEntry[]
  /** Product recipes in use (0 when the recipe file couldn't be read: listings then use category defaults). */
  recipes: number
  offers: ReadonlyMap<string, Offer>
  variantLabels: ReadonlyMap<string, string>
  /** Resolves when the snapshot is ready; concurrent calls share one request. Rejects on failure (call again to retry). */
  load: () => Promise<void>
  /** Store a newer offer (a refreshed price) wherever the old one was read. */
  updateOffer: (offer: Offer) => void
}

/** Valid recipes for products in the snapshot, registered for drawing; bad entries are skipped, never drawn. */
async function loadRecipes(pending: Promise<unknown> | null, snapshot: Snapshot): Promise<Map<string, Recipe>> {
  const byProduct = new Map<string, Recipe>()
  if (!pending) return byProduct
  let file: unknown
  try {
    file = await pending
  } catch (error) {
    console.warn('Product looks unavailable; using category defaults.', error)
    return byProduct
  }
  const list = file && typeof file === 'object' && (file as { version?: unknown }).version === 1 ? (file as { recipes?: unknown }).recipes : undefined
  if (!Array.isArray(list)) return byProduct
  const products = new Set(snapshot.products.map((p) => p.id))
  let skipped = 0
  for (const entry of list) {
    const result = validateRecipe(entry)
    if (!result.ok || !result.recipe.productId || !products.has(result.recipe.productId)) {
      skipped += 1
      continue
    }
    byProduct.set(result.recipe.productId, result.recipe)
  }
  registerRecipes([...byProduct.values()])
  if (skipped > 0) console.warn(`Skipped ${skipped} product looks that did not validate or match the catalog.`)
  return byProduct
}

export function createCatalogStore(fetchSnapshot: () => Promise<unknown>, fetchRecipes?: () => Promise<unknown>): StoreApi<CatalogState> {
  let pending: Promise<void> | null = null
  return createStore<CatalogState>()((set, get) => ({
    status: 'idle',
    retrievedAt: null,
    entries: [],
    recipes: 0,
    offers: new Map(),
    variantLabels: new Map(),
    load() {
      if (get().status === 'ready') return Promise.resolve()
      pending ??= (async () => {
        set({ status: 'loading' })
        try {
          // Both files load in parallel; the looks are optional, the listings are not.
          const recipeFile = fetchRecipes ? fetchRecipes() : null
          recipeFile?.catch(() => {})
          const snapshot = Snapshot.parse(await fetchSnapshot())
          const recipes = await loadRecipes(recipeFile, snapshot)
          const entries = snapshotEntries(snapshot, recipes)
          set({
            status: 'ready',
            retrievedAt: snapshot.retrievedAt,
            entries,
            recipes: recipes.size,
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
