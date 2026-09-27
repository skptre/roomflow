import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from 'zustand'
import {
  acceptResult,
  filterHard,
  preloadPicks,
  rankSoft,
  type CatalogEntry,
  type CatalogSource,
  type PlacementTarget,
} from '../domain/catalog'
import { inStockFirst } from '../catalog/display'
import { matchesSearch } from '../catalog/snapshotCatalog'
import { alternativeCategories, CHAIR_CATEGORIES, CATEGORIES } from '../domain/categories'
import { designStore } from '../domain/designStore'
import type { Money, RoomObject } from '../domain/schema'
import { prepareAssets } from '../scene/assetPreload'
import { cancelCatalogPreview } from './catalogActions'
import { ProductCard } from './ProductCard'
import { StudioIcon } from './StudioIcon'

/** Cards rendered at a time; "Show more" adds another page. */
const PAGE = 24

function byProduct(entries: readonly CatalogEntry[]): CatalogEntry[][] {
  const groups = new Map<string, CatalogEntry[]>()
  for (const entry of entries) {
    const group = groups.get(entry.product.id)
    if (group) group.push(entry)
    else groups.set(entry.product.id, [entry])
  }
  return [...groups.values()]
}

/** Put a couple of relevant choices for each piece already in the room up front. */
function roomFirst(products: CatalogEntry[][], roomCategories: readonly string[]): CatalogEntry[][] {
  const key = (category: string) => CHAIR_CATEGORIES.includes(category as typeof CHAIR_CATEGORIES[number]) ? 'chair' : category
  const categories = [...new Set(roomCategories.map(key))]
  const chosen = new Set<CatalogEntry[]>()
  const leading: CatalogEntry[][] = []
  for (let round = 0; round < 2; round++) {
    for (const category of categories) {
      const next = products.find((variants) => key(variants[0]!.product.category) === category && !chosen.has(variants))
      if (next) { chosen.add(next); leading.push(next) }
    }
  }
  return [...leading, ...products.filter((variants) => !chosen.has(variants))]
}

export function CatalogPanel({
  source,
  selected,
  budgetRemaining,
  onClose,
}: {
  source: CatalogSource
  selected: RoomObject | null
  budgetRemaining: Money | null
  onClose: () => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
  }, [])
  const revision = useStore(designStore, (state) => state.committed?.revision ?? 0)
  const currentRoom = useStore(designStore, (state) => state.committed?.room)
  const roomCategories = useMemo(() => currentRoom?.objects.map((object) => object.category) ?? [], [currentRoom])
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState('')
  const [retry, setRetry] = useState(0)
  const [shown, setShown] = useState(PAGE)
  const [results, setResults] = useState<{
    key: string
    entries: CatalogEntry[]
    source?: 'sample' | 'snapshot' | 'live'
    error?: string
  } | null>(null)
  const categories = useMemo(
    () => (selected ? alternativeCategories(selected.category) : category ? alternativeCategories(category) : undefined),
    [selected, category],
  )
  const target: PlacementTarget = selected ? { mode: 'swap', objectId: selected.id } : { mode: 'add' }
  const queryKey = `${categories?.join(',') ?? 'all'}|${revision}|${budgetRemaining?.amountMinor ?? 'none'}|${budgetRemaining?.currency ?? ''}|${retry}`
  useEffect(() => {
    let cancelled = false
    source
      .query({ category: categories, budgetRemaining, baseRevision: revision })
      .then((result) => {
        const room = designStore.getState().committed?.room
        const accepted = acceptResult(result, designStore.getState().committed?.revision ?? -1)
        if (cancelled || !accepted || !room) return
        const entries = filterHard(accepted, { category: categories, budgetRemaining }, room)
        // Warm the likeliest few models so trying one on doesn't wait on a download.
        prepareAssets(preloadPicks(rankSoft(entries, { tags: ['natural', 'warm'] }), 3))
        setResults({ key: queryKey, entries, source: result.source })
      })
      .catch(() => {
        if (!cancelled)
          setResults({
            key: queryKey,
            entries: [],
            error: 'The pieces couldn’t load. Your room is right where you left it.',
          })
      })
    return () => {
      cancelled = true
    }
  }, [source, categories, budgetRemaining, revision, queryKey])
  useEffect(() => () => cancelCatalogPreview(), [])
  const loading = results?.key !== queryKey
  // Rank once per result; filtering on each keystroke then stays cheap on a large catalog.
  const ranked = useMemo(() => inStockFirst(rankSoft(results?.entries ?? [], { tags: ['natural', 'warm'] })), [results])
  const products = useMemo(() => {
    const matches = byProduct(ranked.filter((entry) => matchesSearch(entry, search)))
    return !selected && !category && !search.trim() ? roomFirst(matches, roomCategories) : matches
  }, [ranked, search, selected, category, roomCategories])
  const pricesAsOf = useMemo(() => {
    const times = (results?.entries ?? []).map((entry) => entry.offer.retrievedAt).sort()
    return times[0] ? new Date(times[0]).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : null
  }, [results])
  function changeFilter(change: () => void) {
    cancelCatalogPreview()
    setShown(PAGE)
    change()
  }
  return (
    <section className="catalog-content" aria-label="Find furniture">
      <div className="panel-heading">
        <div>
          <h2 ref={heading} tabIndex={-1}>
            {selected ? `Find a ${CHAIR_CATEGORIES.some((chair) => chair === selected.category) || selected.category === 'chair' ? 'chair' : selected.name.toLowerCase()}` : 'Find a piece'}
          </h2>
        </div>
      </div>
      {selected ? (
        <div className="replacement-note">
          <span>
            Replacing <strong>{selected.name}</strong>
          </span>
          <button onClick={onClose}>Browse all</button>
        </div>
      ) : (
        null
      )}
      <label className="catalog-search">
        <StudioIcon name="search" size={18} />
        <input
          aria-label="Search furniture"
          placeholder="Search"
          value={search}
          onChange={(event) => changeFilter(() => setSearch(event.target.value))}
        />
      </label>
      {!selected && (
        <select
          className="category-select"
          aria-label="Furniture category"
          value={category}
          onChange={(event) => changeFilter(() => setCategory(event.target.value))}
        >
          <option value="">All</option>
          <option value="chair">Chair</option>
          {Object.entries(CATEGORIES).filter(([id, info]) => !info.builtIn && !CHAIR_CATEGORIES.some((chair) => chair === id)).map(([id, info]) => (
            <option key={id} value={id}>
              {info.label}
            </option>
          ))}
        </select>
      )}
      <div className="catalog-meta">
        <span>
          {loading ? 'Loading…' : `${products.length} ${products.length === 1 ? 'piece' : 'pieces'}`}
        </span>
        <span>{results?.source === 'sample' ? 'Sample collection' : pricesAsOf ? `Prices: ${pricesAsOf}` : 'Store listings'}</span>
      </div>
      <div className="product-list" aria-busy={loading}>
        {loading && (
          <p className="empty-message" role="status">
            Loading pieces…
          </p>
        )}
        {!loading && results?.error && (
          <div className="empty-message" role="alert">
            <p>{results.error}</p>
            <button className="studio-secondary" onClick={() => setRetry(retry + 1)}>
              Try again
            </button>
          </div>
        )}
        {!loading && !results?.error && products.length === 0 && (
          <div className="empty-message">
            <h3>No pieces found</h3>
            <p>Try another search or category.</p>
            <button
              className="studio-secondary"
              onClick={() => {
                setSearch('')
                setCategory('')
              }}
            >
              Reset search
            </button>
          </div>
        )}
        {!loading &&
          products.slice(0, shown).map((variants) => (
            <ProductCard
              key={`${variants[0]!.product.id}|${selected?.id ?? 'add'}`}
              variants={variants}
              target={target}
            />
          ))}
      </div>
      {!loading && products.length > shown && (
        <button className="studio-secondary catalog-more" onClick={() => setShown(shown + PAGE)}>
          Show more ({products.length - shown} left)
        </button>
      )}
      <p className="catalog-disclaimer">
        {results?.source === 'sample'
          ? 'Illustrative pieces and prices to explore your style. These aren’t live store listings.'
          : 'Real products from each store’s public listings. Prices are product subtotals as listed then, before tax and shipping; check the store before buying.'}
      </p>
    </section>
  )
}
