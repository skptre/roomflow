import { useEffect, useId, useState } from 'react'
import { useStore } from 'zustand'
import type { CatalogEntry, PlacementTarget } from '../domain/catalog'
import { designStore } from '../domain/designStore'
import { formatDimensions } from '../domain/labels'
import { formatMoney } from '../domain/money'
import { endPreview, ownsPreview, placeEntry, previewEntry } from './catalogActions'
import { FurnitureThumbnail } from './FurnitureThumbnail'
import { StudioIcon } from './StudioIcon'

export function ProductCard({ variants, target }: { variants: CatalogEntry[]; target: PlacementTarget }) {
  const [variantIndex, setVariantIndex] = useState(0)
  const [quantity, setQuantity] = useState(1)
  const [problem, setProblem] = useState<string | null>(null)
  const owner = useId()
  const entry = variants[variantIndex] ?? variants[0]!
  const preview = useStore(designStore, (state) => state.preview)
  const active = preview !== null && ownsPreview(owner)
  useEffect(() => () => endPreview(owner), [owner])
  function tryEntry(next = entry, qty = quantity) {
    const outcome = previewEntry(owner, next, target, qty)
    setProblem(outcome.ok ? null : outcome.message)
  }
  return (
    <article className={`product-card ${active ? 'is-previewing' : ''}`} aria-label={entry.product.name}>
      <div className="product-image">
        <FurnitureThumbnail asset={entry.variant.asset} dimensions={entry.variant.dimensions} />
        <span className="product-style">{entry.product.tags.slice(0, 2).join(' · ')}</span>
        {active && (
          <span className="preview-badge">
            <StudioIcon name="eye" size={14} /> Trying it on
          </span>
        )}
      </div>
      <div className="product-copy">
        <div className="product-title">
          <h3>{entry.product.name}</h3>
          <strong>
            {entry.offer.price
              ? formatMoney({ ...entry.offer.price, amountMinor: entry.offer.price.amountMinor * quantity })
              : 'Unpriced'}
          </strong>
        </div>
        <p className="product-dimensions">{formatDimensions(entry.variant.dimensions)}</p>
        {variants.length > 1 ? (
          <label className="variant-select">
            <span>Size / finish</span>
            <select
              aria-label={`${entry.product.name} size or finish`}
              value={variantIndex}
              onChange={(event) => {
                const index = Number(event.target.value)
                setVariantIndex(index)
                setProblem(null)
                if (active) tryEntry(variants[index]!)
              }}
            >
              {variants.map((variant, index) => (
                <option value={index} key={variant.variant.id}>
                  {variant.variant.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="single-variant">
            {entry.variant.label} <span>· Sample piece</span>
          </p>
        )}
        {active && (
          <div className="quantity-row">
            <span>Quantity</span>
            <div role="group" aria-label={`Quantity of ${entry.product.name}`}>
              <button
                aria-label={`Fewer ${entry.product.name}`}
                disabled={quantity <= 1}
                onClick={() => {
                  setQuantity(quantity - 1)
                  tryEntry(entry, quantity - 1)
                }}
              >
                −
              </button>
              <output aria-live="polite">{quantity}</output>
              <button
                aria-label={`More ${entry.product.name}`}
                disabled={quantity >= 9}
                onClick={() => {
                  setQuantity(quantity + 1)
                  tryEntry(entry, quantity + 1)
                }}
              >
                +
              </button>
            </div>
          </div>
        )}
        <div className="product-actions">
          {active ? (
            <>
              <button className="studio-secondary" onClick={() => endPreview(owner)}>
                Cancel
              </button>
              <button className="studio-primary" onClick={() => placeEntry(owner, entry, target, quantity)}>
                <StudioIcon name="check" size={16} />
                {target.mode === 'swap' ? 'Use this piece' : 'Add to room'}
              </button>
            </>
          ) : (
            <button className="try-button" onClick={() => tryEntry()}>
              <StudioIcon name="plus" size={16} />
              Try in my room
              <StudioIcon name="arrow" size={16} />
            </button>
          )}
        </div>
        {problem && (
          <p role="status" className="product-problem">
            {problem}{' '}
            {target.mode === 'add' ? 'Try replacing a piece you already have.' : 'Try a smaller size or another piece.'}
          </p>
        )}
      </div>
    </article>
  )
}
