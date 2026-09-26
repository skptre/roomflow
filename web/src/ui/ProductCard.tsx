import { useEffect, useId, useState } from 'react'
import type { CatalogEntry, PlacementTarget } from '../domain/catalog'
import { formatDimensions } from '../domain/labels'
import { formatMoney } from '../domain/money'
import { Button } from './Button'
import { endPreview, placeEntry, previewEntry } from './catalogActions'
import { Chip } from './Chip'

type ProductCardProps = {
  /** All variants of one product (sizes / finishes), in catalog order. */
  variants: CatalogEntry[]
  target: PlacementTarget
}

/** One product: hover or focus to preview it in the room, pick a variant and quantity, then add or swap it in. */
export function ProductCard({ variants, target }: ProductCardProps) {
  const [variantIndex, setVariantIndex] = useState(0)
  const [quantity, setQuantity] = useState(1)
  const [problem, setProblem] = useState<string | null>(null)
  const owner = useId()
  const entry = variants[variantIndex] ?? variants[0]!
  const product = entry.product
  const price = entry.offer.price
  const action = target.mode === 'swap' ? 'Swap in' : 'Add to room'

  const preview = (next: CatalogEntry = entry, qty = quantity) => {
    const outcome = previewEntry(owner, next, target, qty)
    setProblem(outcome.ok ? null : outcome.message)
  }
  const leave = () => endPreview(owner)
  // If the card goes away while it owns the preview (panel closed, results changed), clear it.
  useEffect(() => () => endPreview(owner), [owner])

  return (
    <article
      aria-label={product.name}
      onPointerEnter={() => preview()}
      onPointerLeave={leave}
      onFocus={() => preview()}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) leave()
      }}
      className="rounded-lg border border-line bg-surface-raised p-3 transition-shadow duration-[var(--duration-fast)] hover:shadow-panel focus-within:shadow-panel"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-ink">{product.name}</h3>
          <p className="text-xs text-muted">{formatDimensions(entry.variant.dimensions)}</p>
        </div>
        <span className={`shrink-0 text-sm font-semibold ${price ? 'text-ink' : 'text-muted'}`}>
          {price ? formatMoney({ amountMinor: price.amountMinor * quantity, currency: price.currency }) : 'Price unknown'}
        </span>
      </div>

      {variants.length > 1 ? (
        <div role="radiogroup" aria-label={`${product.name} options`} className="mt-2 flex flex-wrap gap-1">
          {variants.map((option, index) => (
            <button
              key={option.variant.id}
              type="button"
              role="radio"
              aria-checked={index === variantIndex}
              onClick={() => {
                setVariantIndex(index)
                preview(option)
              }}
              className={`rounded-pill px-2 py-0.5 text-xs transition-colors duration-[var(--duration-fast)] ${
                index === variantIndex ? 'bg-accent text-accent-ink' : 'bg-surface-sunken text-muted hover:text-ink'
              }`}
            >
              {option.variant.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        {entry.offer.isSample ? <Chip tone="muted">Sample</Chip> : null}
        <span className="flex-1" />
        <QuantityStepper
          value={quantity}
          label={product.name}
          onChange={(next) => {
            setQuantity(next)
            preview(entry, next)
          }}
        />
        <Button size="sm" variant="primary" disabled={problem !== null} onClick={() => placeEntry(owner, entry, target, quantity)}>
          {action}
        </Button>
      </div>
      {problem ? <p className="mt-2 text-xs text-danger">{problem}</p> : null}
    </article>
  )
}

function QuantityStepper({ value, label, onChange }: { value: number; label: string; onChange: (next: number) => void }) {
  const id = useId()
  return (
    <div className="flex items-center rounded-md border border-line" role="group" aria-labelledby={id}>
      <span id={id} className="sr-only">
        Quantity of {label}
      </span>
      <button type="button" aria-label="Fewer" disabled={value <= 1} onClick={() => onChange(value - 1)} className="h-8 w-7 text-muted disabled:opacity-40">
        −
      </button>
      <output aria-live="polite" className="w-5 text-center text-sm tabular-nums text-ink">
        {value}
      </output>
      <button type="button" aria-label="More" disabled={value >= 9} onClick={() => onChange(value + 1)} className="h-8 w-7 text-muted disabled:opacity-40">
        +
      </button>
    </div>
  )
}
