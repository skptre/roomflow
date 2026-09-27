import { useEffect, useMemo, useState } from 'react'
import { useStore } from 'zustand'
import type { CatalogEntry } from '../domain/catalog'
import { designStore } from '../domain/designStore'
import type { SummarySources } from '../domain/purchases'
import { buildProposal, proposalOutcome, THEMES, type Theme } from '../domain/themes'
import { Button } from './Button'
import { FloatingPanel } from './FloatingPanel'
import { CloseIcon } from './icons'
import { commitLook, endLookPreview, previewLook } from './lookActions'

type ThemePickerProps = {
  catalog: readonly CatalogEntry[]
  sources: SummarySources
  onClose: () => void
}
/** Compact choices keep the room visible. A clicked preview stays until another choice or dismissal. */
export function ThemePicker({ catalog, sources, onClose }: ThemePickerProps) {
  const committed = useStore(designStore, (state) => state.committed)
  const preview = useStore(designStore, (state) => state.preview)
  const [active, setActive] = useState<string | null>(null)

  const looks = useMemo(() => {
    if (!committed) return []
    return THEMES.map((theme) => {
      const proposal = buildProposal(committed.room, theme, catalog, committed.budget, committed.revision)
      return { theme, proposal, outcome: proposalOutcome(committed.room, proposal, sources, committed.budget) }
    })
  }, [committed, catalog, sources])

  useEffect(() => () => THEMES.forEach((theme) => endLookPreview(theme.id)), [])

  return (
    <FloatingPanel label="Try a look" className="look-panel">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-base font-semibold text-ink">Try a look</h2>
        <Button variant="ghost" size="sm" icon={<CloseIcon />} aria-label="Close looks" onClick={onClose} />
      </div>
      <div className="look-options">
        {looks.map(({ theme, proposal, outcome }) => (
          <LookCard
            key={theme.id}
            theme={theme}
            conflictCount={proposal.conflicts.length}
            error={outcome.ok ? null : outcome.error}
            active={Boolean(preview) && active === theme.id}
            onPreview={() => {
              if (previewLook(theme.id, proposal)) setActive(theme.id)
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
  conflictCount: number
  error: string | null
  active: boolean
  onPreview: () => void
  onChoose: () => void
}

function LookCard({ theme, conflictCount, error, active, onPreview, onChoose }: LookCardProps) {
  const swatches = [theme.finishes.wall, theme.finishes.floor, theme.finishes.accent].filter((color): color is string => Boolean(color))
  return (
    <article className={`look-option ${active ? 'is-active' : ''}`}>
      <button type="button" className="look-preview" aria-label={`Preview ${theme.name}`} title={theme.description} aria-pressed={active} disabled={Boolean(error)} onClick={onPreview}>
        <div className="flex items-center gap-2">
          <div className="flex -space-x-1" aria-hidden="true">
            {swatches.map((color) => (
              <span key={color} className="size-4 rounded-full border border-surface" style={{ background: color }} />
            ))}
          </div>
          <h3 className="text-sm font-semibold text-ink">{theme.name}</h3>
        </div>
      </button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      {conflictCount > 0 && !error ? <p className="text-xs text-muted">{conflictCount} pieces unavailable</p> : null}
      <Button variant="primary" size="sm" disabled={Boolean(error) || !active} onClick={onChoose}>
        Apply
      </Button>
    </article>
  )
}
