import { useEffect, useId, useState } from 'react'
import { useStore } from 'zustand'
import { catalogStore } from '../catalog/appCatalog'
import { sizedImage } from '../catalog/display'
import { pickVariant } from '../catalog/snapshotCatalog'
import type { CatalogEntry, PlacementTarget } from '../domain/catalog'
import { designStore } from '../domain/designStore'
import { formatSizeWithSource } from '../domain/labels'
import { formatMoney } from '../domain/money'
import { endPreview, ownsPreview, placeEntry, previewEntry } from './catalogActions'
import { FurnitureThumbnail } from './FurnitureThumbnail'
import { StudioIcon } from './StudioIcon'

export function ProductCard({ variants, target }: { variants: CatalogEntry[]; target: PlacementTarget }) {
  const [variantIndex, setVariantIndex] = useState(0)
  const [quantity, setQuantity] = useState(1)
  const [problem, setProblem] = useState<string | null>(null)
  const [photoFailed, setPhotoFailed] = useState<string | null>(null)
  const owner = useId()
  const listed = variants[variantIndex] ?? variants[0]!
  // A refreshed price replaces the offer in the catalog map; show that, not the copy from the query.
  const liveOffer = useStore(catalogStore, (state) => state.offers.get(listed.offer.id))
  const entry = liveOffer && liveOffer !== listed.offer ? { ...listed, offer: liveOffer } : listed
  const optionNames = entry.product.optionNames ?? []
  const photo = entry.variant.imageUrl && photoFailed !== entry.variant.imageUrl ? entry.variant.imageUrl : null
  const soldOut = entry.offer.available === false
  function chooseVariant(index: number) {
    setVariantIndex(index)
    setProblem(null)
    if (active) tryEntry(variants[index]!)
  }
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
        {photo ? (
          <img
            className="product-photo"
            src={sizedImage(photo, 480)}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setPhotoFailed(photo)}
          />
        ) : (
          <FurnitureThumbnail asset={entry.variant.asset} dimensions={entry.variant.dimensions} />
        )}
        {soldOut && <span className="sold-out-badge">Sold out</span>}
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
              : 'Price unknown'}
          </strong>
        </div>
        {entry.product.store && <p className="product-store">{entry.product.store}</p>}
        <p className="product-dimensions">{formatSizeWithSource(entry.variant.dimensions)}</p>
        {optionNames.length > 0 && variants.length > 1 ? (
          optionNames.map((name, option) => {
            const values = [...new Set(variants.map((variant) => variant.variant.optionValues?.[option] ?? ''))].filter(Boolean)
            if (values.length < 2) return null
            const chosen = entry.variant.optionValues ?? []
            return (
              <label className="variant-select" key={name}>
                <span>{name}</span>
                <select
                  aria-label={`${entry.product.name} ${name.toLowerCase()}`}
                  value={chosen[option] ?? ''}
                  onChange={(event) => {
                    const next = chosen.map((value, i) => (i === option ? event.target.value : value))
                    chooseVariant(pickVariant(variants.map((variant) => variant.variant), next, option))
                  }}
                >
                  {values.map((value) => (
                    <option value={value} key={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            )
          })
        ) : variants.length > 1 ? (
          <label className="variant-select">
            <span>Size / finish</span>
            <select
              aria-label={`${entry.product.name} size or finish`}
              value={variantIndex}
              onChange={(event) => chooseVariant(Number(event.target.value))}
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
            {entry.variant.label} {entry.offer.isSample && <span>· Sample piece</span>}
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
        {entry.offer.url && (
          <a className="store-link" href={entry.offer.url} target="_blank" rel="noopener noreferrer">
            View at {entry.offer.merchant} <span aria-hidden="true">↗</span>
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        )}
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
