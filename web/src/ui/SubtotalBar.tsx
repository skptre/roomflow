import { useId, useMemo, useState } from 'react'
import { useStore } from 'zustand'
import { designStore } from '../domain/designStore'
import { formatMoney } from '../domain/money'
import { purchaseSummary, type PurchaseSummary, type SummarySources } from '../domain/purchases'
import { Chip } from './Chip'
import { FloatingPanel } from './FloatingPanel'
import { noticeStore } from './noticeStore'

const CURRENCY = 'USD'

function totalText(summary: PurchaseSummary): string {
  const { subtotal } = summary
  if (subtotal.status === 'mixed-currency') return subtotal.totals.map((money) => formatMoney(money)).join(' + ')
  return formatMoney(subtotal.total ?? { amountMinor: 0, currency: CURRENCY })
}

function BudgetLine({ summary, budget }: { summary: PurchaseSummary; budget: { amountMinor: number; currency: string } | null }) {
  const unpriced = summary.subtotal.unpricedCount
  switch (summary.budget) {
    case 'no-budget':
      return <span className="text-muted">No budget set</span>
    case 'under':
      return <Chip tone="success">Within {formatMoney(budget!)} budget</Chip>
    case 'over': {
      const over = summary.subtotal.total!.amountMinor - budget!.amountMinor
      return <Chip tone="danger">Over budget by {formatMoney({ amountMinor: over, currency: budget!.currency })}</Chip>
    }
    case 'unknown':
      return (
        <Chip tone="muted">
          {summary.subtotal.status === 'mixed-currency'
            ? "Can't compare: mixed currencies"
            : `Can't confirm budget: price unknown for ${unpriced} ${unpriced === 1 ? 'item' : 'items'}`}
        </Chip>
      )
  }
}

/**
 * Product subtotal of the committed design (never the preview), budget status,
 * and an expandable purchase list. A preview shows what the total would become,
 * without changing it.
 */
export function SubtotalBar({ sources }: { sources: SummarySources }) {
  const committed = useStore(designStore, (state) => state.committed)
  const preview = useStore(designStore, (state) => state.preview)
  const [open, setOpen] = useState(false)
  const listId = useId()
  const budgetId = useId()

  const summary = useMemo(() => (committed ? purchaseSummary(committed.room, sources, committed.budget) : null), [committed, sources])
  const previewSummary = useMemo(
    () => (committed && preview ? purchaseSummary(preview.room, sources, committed.budget) : null),
    [committed, preview, sources],
  )
  if (!committed || !summary) return null
  const budget = committed.budget
  const unpriced = summary.subtotal.unpricedCount

  return (
    <FloatingPanel label="Purchases" className="w-80 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium tracking-wide text-muted uppercase">Product subtotal</span>
        {summary.anySample ? <Chip tone="muted">Sample prices</Chip> : null}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums text-ink">{totalText(summary)}</span>
        {unpriced > 0 ? <span className="text-xs text-muted">+ {unpriced} unpriced</span> : null}
      </div>
      {previewSummary ? (
        <p className="mt-0.5 text-xs text-accent" aria-live="polite">
          With this preview: {totalText(previewSummary)}
          {previewSummary.subtotal.unpricedCount > 0 ? ` + ${previewSummary.subtotal.unpricedCount} unpriced` : ''}
        </p>
      ) : null}
      <div className="mt-2 text-xs">
        <BudgetLine summary={summary} budget={budget} />
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
        <label htmlFor={budgetId} className="text-sm text-muted">
          Budget
        </label>
        <BudgetInput id={budgetId} amountMinor={budget?.amountMinor ?? null} key={budget?.amountMinor ?? 'none'} />
        <span className="flex-1" />
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen(!open)}
          className="rounded-md px-2 py-1 text-sm font-medium text-ink hover:bg-surface-sunken"
        >
          {open ? 'Hide items' : `Items (${summary.lines.length})`}
        </button>
      </div>

      {open ? (
        <div id={listId} className="mt-2 max-h-56 overflow-y-auto">
          {summary.lines.length === 0 ? <p className="py-2 text-sm text-muted">Nothing to buy yet.</p> : null}
          <ul className="divide-y divide-line">
            {summary.lines.map((line) => (
              <li key={line.id} className="flex items-baseline justify-between gap-2 py-1.5 text-sm">
                <span className="min-w-0 truncate text-ink">
                  {line.name}
                  {line.variantLabel ? <span className="text-muted"> · {line.variantLabel}</span> : null}
                  {line.quantity > 1 ? <span className="text-muted"> × {line.quantity}</span> : null}
                </span>
                <span className={`shrink-0 tabular-nums ${line.lineTotal ? 'text-ink' : 'text-muted'}`}>
                  {line.lineTotal ? formatMoney(line.lineTotal) : 'Price unknown'}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">
            Already yours: {summary.ownedCount} {summary.ownedCount === 1 ? 'item' : 'items'} (not counted). Excludes tax and shipping.
          </p>
        </div>
      ) : null}
    </FloatingPanel>
  )
}

/** Whole-currency budget entry; commits on Enter or blur as one undoable change. */
function BudgetInput({ id, amountMinor }: { id: string; amountMinor: number | null }) {
  const [text, setText] = useState(amountMinor === null ? '' : String(Math.round(amountMinor / 100)))

  function commit() {
    const trimmed = text.trim().replace(/[$,\s]/g, '')
    if (trimmed === '') {
      if (amountMinor !== null) designStore.getState().setBudget(null)
      return
    }
    const dollars = Number(trimmed)
    if (!Number.isFinite(dollars) || dollars < 0 || !Number.isInteger(dollars) || dollars > 10_000_000) {
      noticeStore.getState().show('Enter a whole-dollar budget, like 600.', 'warning')
      setText(amountMinor === null ? '' : String(Math.round(amountMinor / 100)))
      return
    }
    if (dollars * 100 !== amountMinor) designStore.getState().setBudget({ amountMinor: dollars * 100, currency: CURRENCY })
  }

  return (
    <div className="flex items-center rounded-md border border-line bg-surface-raised px-2 focus-within:outline-2 focus-within:outline-focus">
      <span aria-hidden="true" className="text-sm text-muted">
        $
      </span>
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        placeholder="None"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
        className="h-8 w-20 bg-transparent px-1 text-sm tabular-nums text-ink outline-none"
      />
    </div>
  )
}
