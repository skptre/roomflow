import { useEffect, useMemo, useState } from 'react'
import { useStore } from 'zustand'
import { acceptResult, filterHard, preloadPicks, rankSoft, type CatalogEntry, type CatalogSource, type PlacementTarget } from '../domain/catalog'
import { alternativeCategories, CATEGORIES } from '../domain/categories'
import { designStore } from '../domain/designStore'
import type { Money, RoomObject } from '../domain/schema'
import { prepareAssets } from '../scene/assetPreload'
import { Button } from './Button'
import { Chip } from './Chip'
import { FloatingPanel } from './FloatingPanel'
import { endAnyPreview } from './catalogActions'
import { CloseIcon } from './icons'
import { ProductCard } from './ProductCard'

type CatalogPanelProps = {
  source: CatalogSource
  /** The object whose alternatives to show; null browses by category and adds. */
  selected: RoomObject | null
  budgetRemaining: Money | null
  onClose: () => void
}

const CATEGORY_IDS = Object.keys(CATEGORIES)

/** Group per-variant entries into products, keeping catalog order. */
function byProduct(entries: readonly CatalogEntry[]): CatalogEntry[][] {
  const groups = new Map<string, CatalogEntry[]>()
  for (const entry of entries) {
    const group = groups.get(entry.product.id)
    if (group) group.push(entry)
    else groups.set(entry.product.id, [entry])
  }
  return [...groups.values()]
}

/**
 * Browse products next to the room. With an object selected it lists that
 * object's alternatives (swap in place); otherwise it browses a category and
 * adds to a free spot. Hovering a card previews it in the room.
 */
export function CatalogPanel({ source, selected, budgetRemaining, onClose }: CatalogPanelProps) {
  const revision = useStore(designStore, (state) => state.committed?.revision ?? 0)
  const [tab, setTab] = useState(CATEGORY_IDS[0]!)
  const [results, setResults] = useState<{ key: string; entries: CatalogEntry[]; failed?: boolean } | null>(null)
  const [attempt, setAttempt] = useState(0)

  const categories = useMemo(() => (selected ? alternativeCategories(selected.category) : [tab]), [selected, tab])
  const target: PlacementTarget = selected ? { mode: 'swap', objectId: selected.id } : { mode: 'add' }
  const queryKey = `${categories.join(',')}|${revision}|${budgetRemaining?.amountMinor ?? 'none'}|${attempt}`

  // A preview belongs to one target; when the selection (or add/swap mode) changes, drop it.
  const targetKey = selected ? selected.id : 'add'
  useEffect(() => {
    endAnyPreview()
  }, [targetKey])
  useEffect(() => () => endAnyPreview(), [])

  // Callers pass stable `selected` / `budgetRemaining` values, so this re-queries only when the query changes.
  useEffect(() => {
    let cancelled = false
    const baseRevision = revision
    source.query({ category: categories, budgetRemaining, baseRevision }).then((result) => {
      const room = designStore.getState().committed?.room
      const current = designStore.getState().committed?.revision ?? -1
      // Results for an older room revision are dropped, never shown as current.
      const accepted = acceptResult(result, current)
      if (cancelled || !accepted || !room) return
      const ranked = rankSoft(filterHard(accepted, { category: categories, budgetRemaining }, room), { tags: [] })
      prepareAssets(preloadPicks(ranked, 3))
      setResults({ key: queryKey, entries: ranked })
    }, () => {
      // A failed source leaves the room and saved catalog untouched; offer a retry.
      if (!cancelled) setResults({ key: queryKey, entries: [], failed: true })
    })
    return () => {
      cancelled = true
    }
  }, [source, categories, budgetRemaining, revision, queryKey])

  const loading = results?.key !== queryKey
  const failed = !loading && results?.failed === true
  const products = results ? byProduct(results.entries) : []
  const heading = selected ? `Alternatives for this ${selected.name.toLowerCase()}` : 'Browse'

  return (
    <FloatingPanel label="Catalog" className="flex max-h-full min-h-0 w-80 flex-col">
      <div className="flex items-start justify-between gap-2 p-4 pb-2">
        <div>
          <h2 className="text-base font-semibold text-ink">{heading}</h2>
          <p className="mt-0.5 text-xs text-muted">Hover to try it in your room.</p>
        </div>
        <div className="flex items-center gap-1">
          <Chip tone="muted">Sample catalog</Chip>
          <Button variant="ghost" size="sm" icon={<CloseIcon />} aria-label="Close catalog" onClick={onClose} />
        </div>
      </div>

      {!selected ? (
        <div role="tablist" aria-label="Categories" className="flex gap-1 overflow-x-auto px-4 pb-2">
          {CATEGORY_IDS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={id === tab}
              onClick={() => setTab(id)}
              className={`shrink-0 rounded-pill px-2.5 py-1 text-xs font-medium transition-colors duration-[var(--duration-fast)] ${
                id === tab ? 'bg-ink text-surface' : 'bg-surface-sunken text-muted hover:text-ink'
              }`}
            >
              {CATEGORIES[id]!.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex-1 space-y-2 overflow-y-auto px-4 pb-4" aria-busy={loading}>
        {loading ? <p className="py-6 text-center text-sm text-muted">Finding options…</p> : null}
        {failed ? (
          <div role="alert" className="py-6 text-center text-sm text-muted">
            <p>Couldn't load products. Your room is unchanged.</p>
            <Button size="sm" className="mt-2" onClick={() => setAttempt(attempt + 1)}>
              Try again
            </Button>
          </div>
        ) : null}
        {!loading && !failed && products.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            {selected ? 'No alternatives for this item in the sample catalog.' : 'Nothing in this category fits the room and budget.'}
          </p>
        ) : null}
        {!loading
          ? products.map((variants) => <ProductCard key={variants[0]!.product.id} variants={variants} target={target} />)
          : null}
      </div>
    </FloatingPanel>
  )
}
