import { useEffect, useMemo, useState } from 'react'
import { useStore } from 'zustand'
import type { CatalogEntry } from '../domain/catalog'
import { designStore } from '../domain/designStore'
import { formatSubtotal, type SummarySources } from '../domain/purchases'
import { buildProposal, proposalOutcome, THEMES, type Theme } from '../domain/themes'
import { Button } from './Button'
import { Chip } from './Chip'
import { FloatingPanel } from './FloatingPanel'
import { CloseIcon } from './icons'
import { commitLook, endLookPreview, previewLook } from './lookActions'

type ThemePickerProps = {
  catalog: readonly CatalogEntry[]
  sources: SummarySources
  onClose: () => void
}

/**
 * "Try a look": three coordinated proposals for this room. Hover (or focus) a
 * look to see it in the room from the same camera; move between cards to
 * compare; "Make it mine" commits it as one undoable step.
 */
export function ThemePicker({ catalog, sources, onClose }: ThemePickerProps) {
  const committed = useStore(designStore, (state) => state.committed)
  const [active, setActive] = useState<string | null>(null)

  const looks = useMemo(() => {
    if (!committed) return []
    return THEMES.map((theme) => {
      const proposal = buildProposal(committed.room, theme, catalog, committed.budget, committed.revision)
      return { theme, proposal, outcome: proposalOutcome(committed.room, proposal, sources, committed.budget) }
    })
  }, [committed, catalog, sources])

  // Leaving the picker (or it unmounting) never leaves a look previewed.
  useEffect(() => () => THEMES.forEach((theme) => endLookPreview(theme.id)), [])

  return (
    <FloatingPanel label="Try a look" className="w-full max-w-[52rem] p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-ink">Try a look</h2>
          <p className="text-xs text-muted">Hover a look to see it in your room. Kept and locked items stay put.</p>
        </div>
        <Button variant="ghost" size="sm" icon={<CloseIcon />} aria-label="Close looks" onClick={onClose} />
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {looks.map(({ theme, proposal, outcome }) => (
          <LookCard
            key={theme.id}
            theme={theme}
            notes={proposal.notes}
            conflicts={proposal.conflicts}
            total={outcome.ok ? formatSubtotal(outcome.summary.subtotal) : null}
            budget={outcome.ok ? outcome.summary.budget : null}
            error={outcome.ok ? null : outcome.error}
            active={active === theme.id}
            onEnter={() => {
              setActive(theme.id)
              previewLook(theme.id, proposal)
            }}
            onLeave={() => {
              setActive((current) => (current === theme.id ? null : current))
              endLookPreview(theme.id)
            }}
            onChoose={() => {
              if (commitLook(theme, proposal)) onClose()
            }}
          />
        ))}
      </div>
    </FloatingPanel>
  )
}

type LookCardProps = {
  theme: Theme
  notes: string[]
  conflicts: string[]
  total: string | null
  budget: 'under' | 'over' | 'unknown' | 'no-budget' | null
  error: string | null
  active: boolean
  onEnter: () => void
  onLeave: () => void
  onChoose: () => void
}

function LookCard({ theme, notes, conflicts, total, budget, error, active, onEnter, onLeave, onChoose }: LookCardProps) {
  const swatches = [theme.finishes.wall, theme.finishes.floor, theme.finishes.accent].filter((color): color is string => Boolean(color))
  return (
    <article
      aria-label={theme.name}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      onFocus={onEnter}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onLeave()
      }}
      className={`flex flex-col rounded-lg border bg-surface-raised p-3 transition-[border-color,box-shadow] duration-[var(--duration-fast)] ${
        active ? 'border-accent shadow-panel' : 'border-line'
      }`}
    >
      <div className="flex items-center gap-2">
        <div className="flex -space-x-1" aria-hidden="true">
          {swatches.map((color) => (
            // Swatch colors are theme data, rendered as-is.
            <span key={color} className="size-4 rounded-full border border-surface" style={{ background: color }} />
          ))}
        </div>
        <h3 className="text-sm font-semibold text-ink">{theme.name}</h3>
      </div>
      <p className="mt-1 text-xs text-muted">{theme.description}</p>

      {error ? (
        <p className="mt-2 text-xs text-danger">{error}</p>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-semibold tabular-nums text-ink">{total}</span>
          {budget === 'under' ? <Chip tone="success">Within budget</Chip> : null}
          {budget === 'unknown' ? <Chip tone="muted">Budget can't be confirmed</Chip> : null}
          {budget === 'over' ? <Chip tone="danger">Over budget</Chip> : null}
        </div>
      )}

      <ul className="mt-2 space-y-0.5 text-xs text-muted" aria-label={`${theme.name} changes`}>
        {notes.slice(0, active ? notes.length : 3).map((note) => (
          <li key={note}>{note}</li>
        ))}
        {!active && notes.length > 3 ? <li>+ {notes.length - 3} more</li> : null}
      </ul>
      {conflicts.length > 0 ? (
        <ul className="mt-2 space-y-0.5 text-xs text-danger">
          {conflicts.map((conflict) => (
            <li key={conflict}>{conflict}</li>
          ))}
        </ul>
      ) : null}

      <span className="flex-1" />
      <Button variant="primary" size="sm" className="mt-3 self-start" disabled={Boolean(error)} onClick={onChoose}>
        Make it mine
      </Button>
    </article>
  )
}
