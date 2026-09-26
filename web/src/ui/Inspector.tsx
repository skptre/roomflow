import { useId, type ReactNode } from 'react'
import type { PurchaseSources } from '../domain/designStore'
import { isWallHung } from '../domain/categories'
import { designStore } from '../domain/designStore'
import { formatLength, priceLabel, provenanceLabel } from '../domain/labels'
import type { MeasurementSource, RoomObject } from '../domain/schema'
import { Button } from './Button'
import { Chip } from './Chip'
import { removeSelected, rotateSelected, setKeep, setLock } from './editorActions'
import { FloatingPanel } from './FloatingPanel'
import { CloseIcon, LockIcon, RotateLeftIcon, RotateRightIcon, TrashIcon } from './icons'

const PROVENANCE_DOT: Record<MeasurementSource, string> = {
  captured: 'bg-success',
  merchant: 'bg-accent',
  user: 'bg-focus',
  estimated: 'bg-muted',
  unknown: 'bg-line',
}

function SizeRow({ label, meters, source }: { label: string; meters: number; source: MeasurementSource }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="flex items-center gap-2 text-ink">
        <span className="tabular-nums">{formatLength(meters)}</span>
        <span className="flex items-center gap-1 text-xs text-muted">
          <span aria-hidden="true" className={`size-1.5 rounded-full ${PROVENANCE_DOT[source]}`} />
          {provenanceLabel(source)}
        </span>
      </dd>
    </div>
  )
}

function Toggle({ label, hint, checked, onChange, icon }: { label: string; hint: string; checked: boolean; onChange: (next: boolean) => void; icon?: ReactNode }) {
  const hintId = useId()
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-sm font-medium text-ink">
          {icon}
          {label}
        </div>
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        aria-describedby={hintId}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-10 shrink-0 rounded-pill transition-colors duration-[var(--duration-fast)] ${checked ? 'bg-accent' : 'bg-line'}`}
      >
        <span
          aria-hidden="true"
          className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-surface-raised shadow-panel transition-transform duration-[var(--duration-base)] ease-[var(--ease-out-soft)] ${checked ? 'translate-x-4' : ''}`}
        />
      </button>
    </div>
  )
}

/** Details and controls for the selected object. */
export function Inspector({ object, sources, onBrowseAlternatives }: { object: RoomObject; sources: PurchaseSources; onBrowseAlternatives: () => void }) {
  const price = priceLabel(object, sources)
  const { width, height, depth, source } = object.dimensions

  return (
    <FloatingPanel label={`${object.name} details`} className="w-72 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-ink">{object.name}</h2>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Chip tone={price.kind === 'owned' ? 'success' : price.kind === 'unknown' ? 'muted' : 'accent'}>{price.text}</Chip>
            {object.fidelity !== 'exact' ? <Chip tone="muted">{object.fidelity === 'placeholder' ? 'No model yet' : 'Approximate look'}</Chip> : null}
            {object.lockPlacement ? (
              <Chip tone="neutral">
                <LockIcon /> Locked
              </Chip>
            ) : null}
          </div>
        </div>
        <Button variant="ghost" size="sm" icon={<CloseIcon />} aria-label="Close details" onClick={() => designStore.getState().select(null)} />
      </div>

      <dl className="mt-3 border-t border-line pt-2">
        <SizeRow label="Width" meters={width} source={source} />
        <SizeRow label="Depth" meters={depth} source={source} />
        <SizeRow label="Height" meters={height} source={source} />
      </dl>

      <div className="mt-2 border-t border-line pt-2">
        <Toggle
          label="Keep in new designs"
          hint="New looks keep this item. It can still move."
          checked={object.keep}
          onChange={(keep) => setKeep(object.id, keep)}
        />
        <Toggle
          label="Lock position"
          hint="Stays exactly here, facing the same way."
          checked={object.lockPlacement}
          onChange={(lock) => setLock(object.id, lock)}
        />
      </div>

      <div className="mt-3 flex items-center gap-1 border-t border-line pt-3">
        <Button size="sm" icon={<RotateLeftIcon />} aria-label="Turn left 15°" disabled={object.lockPlacement || isWallHung(object)} onClick={() => rotateSelected(1)} />
        <Button size="sm" icon={<RotateRightIcon />} aria-label="Turn right 15°" disabled={object.lockPlacement || isWallHung(object)} onClick={() => rotateSelected(-1)} />
        <Button size="sm" variant="secondary" onClick={onBrowseAlternatives}>
          Alternatives
        </Button>
        <span className="flex-1" />
        <Button size="sm" variant="danger" icon={<TrashIcon />} aria-label="Remove from room" onClick={() => removeSelected()} />
      </div>
    </FloatingPanel>
  )
}
