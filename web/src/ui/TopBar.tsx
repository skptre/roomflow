import { useStore } from 'zustand'
import { designStore } from '../domain/designStore'
import type { Room } from '../domain/schema'
import { Button } from './Button'
import { Chip } from './Chip'
import { redo, undo } from './editorActions'
import { RedoIcon, UndoIcon } from './icons'
import { Tooltip } from './Tooltip'

const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)
const MOD = isMac ? '⌘' : 'Ctrl+'

type TopBarProps = {
  room: Room
  catalogOpen: boolean
  onToggleCatalog: () => void
  looksOpen: boolean
  onToggleLooks: () => void
}

/** Room identity on the left; browse and history controls on the right. Stays small so the room leads. */
export function TopBar({ room, catalogOpen, onToggleCatalog, looksOpen, onToggleLooks }: TopBarProps) {
  const canUndo = useStore(designStore, (state) => state.past.length > 0)
  const canRedo = useStore(designStore, (state) => state.future.length > 0)

  return (
    <header className="pointer-events-none absolute inset-x-4 top-4 flex items-start justify-between gap-3">
      <div className="flex items-center gap-2">
        <h1 className="rounded-pill bg-surface/90 px-3 py-1.5 text-sm font-medium text-ink shadow-panel backdrop-blur">{room.name}</h1>
        {room.source.kind === 'synthetic' ? (
          <Chip tone="muted" className="shadow-panel">
            Synthetic sample
          </Chip>
        ) : null}
      </div>
      <div className="pointer-events-auto flex items-center gap-1 rounded-pill bg-surface/90 p-1 shadow-panel backdrop-blur">
        <Button variant={looksOpen ? 'primary' : 'ghost'} size="sm" aria-pressed={looksOpen} onClick={onToggleLooks} className="rounded-pill">
          Try a look
        </Button>
        <Button variant={catalogOpen ? 'primary' : 'ghost'} size="sm" aria-pressed={catalogOpen} onClick={onToggleCatalog} className="rounded-pill">
          Browse
        </Button>
        <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-line" />
        <Tooltip content={`Undo (${MOD}Z)`}>
          {(described) => (
            <Button {...described} variant="ghost" size="sm" icon={<UndoIcon />} aria-label="Undo" disabled={!canUndo} onClick={() => undo()} className="rounded-pill" />
          )}
        </Tooltip>
        <Tooltip content={`Redo (${MOD}Shift+Z)`}>
          {(described) => (
            <Button {...described} variant="ghost" size="sm" icon={<RedoIcon />} aria-label="Redo" disabled={!canRedo} onClick={() => redo()} className="rounded-pill" />
          )}
        </Tooltip>
      </div>
    </header>
  )
}
