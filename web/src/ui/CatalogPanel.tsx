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
import { inStockFirst, matchesMood } from '../catalog/display'
import { matchesSearch } from '../catalog/snapshotCatalog'
import { alternativeCategories, CATEGORIES } from '../domain/categories'
import { designStore } from '../domain/designStore'
import type { Money, RoomObject } from '../domain/schema'
import { prepareAssets } from '../scene/assetPreload'
import { cancelCatalogPreview } from './catalogActions'
import { ProductCard } from './ProductCard'
import { StudioIcon } from './StudioIcon'

const MOODS = [
  { id: '', label: 'All pieces' },
  { id: 'natural', label: 'Natural' },
  { id: 'cozy', label: 'Cozy' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'colorful', label: 'Playful' },
]
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
  const [category, setCategory] = useState('')
  const [mood, setMood] = useState('')
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
    () => (selected ? alternativeCategories(selected.category) : category ? [category] : undefined),
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
  const products = useMemo(
    () => byProduct(ranked.filter((entry) => matchesMood(entry, mood) && matchesSearch(entry, search))),
    [ranked, mood, search],
  )
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
          <span className="eyebrow">A FRESH PERSPECTIVE</span>
          <h2 ref={heading} tabIndex={-1}>
            {selected ? `A new ${selected.name.toLowerCase()}` : 'Find your next favorite'}
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
        <p className="panel-intro">Little changes can make a room feel entirely new.</p>
      )}
      <label className="catalog-search">
        <StudioIcon name="search" size={18} />
        <input
          aria-label="Search furniture"
          placeholder="A chair, a lamp, something cozy…"
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
          <option value="">Every corner of the room</option>
          {Object.entries(CATEGORIES).filter(([, info]) => !info.builtIn).map(([id, info]) => (
            <option key={id} value={id}>
              {info.label}
            </option>
          ))}
        </select>
      )}
      <div className="mood-filters" role="group" aria-label="Furniture style">
        {MOODS.map((option) => (
          <button
            key={option.id}
            aria-pressed={mood === option.id}
            onClick={() => changeFilter(() => setMood(option.id))}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="catalog-meta">
        <span>
          {loading ? 'Finding pieces…' : `${products.length} ${products.length === 1 ? 'piece' : 'pieces'} to explore`}
        </span>
        <span>{results?.source === 'sample' ? 'Sample collection' : pricesAsOf ? `Store prices as of ${pricesAsOf}` : 'Real store listings'}</span>
      </div>
      <div className="product-list" aria-busy={loading}>
        {loading && (
          <p className="empty-message" role="status">
            Gathering a little inspiration…
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
            <StudioIcon name="leaf" size={28} />
            <h3>Nothing here just yet</h3>
            <p>Try another style, a broader search, or adjust your budget.</p>
            <button
              className="studio-secondary"
              onClick={() => {
                setSearch('')
                setMood('')
                setCategory('')
              }}
            >
              Clear filters
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
