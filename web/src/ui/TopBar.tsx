import { useStore } from 'zustand'
import { designStore } from '../domain/designStore'
import type { Room } from '../domain/schema'
import { redo, undo } from './editorActions'
import { RedoIcon, UndoIcon } from './icons'
import { StudioIcon, Wordmark } from './StudioIcon'

type TopBarProps = {
  room: Room
  looksOpen: boolean
  onToggleLooks: () => void
  onHome: () => void
  onHelp: () => void
}

export function TopBar({ room, looksOpen, onToggleLooks, onHome, onHelp }: TopBarProps) {
  const canUndo = useStore(designStore, (state) => state.past.length > 0)
  const canRedo = useStore(designStore, (state) => state.future.length > 0)
  return (
    <header className="studio-header">
      <button className="brand-home" onClick={onHome} aria-label="Roomflow home">
        <Wordmark />
      </button>
      <div className="room-identity">
        <span className="header-divider" />
        <div>
          <h1>{room.source.kind === 'synthetic' ? 'Bedroom' : room.name}</h1>
          <span>
            {room.source.kind === 'synthetic' ? 'Sample room' : 'Your room'}
            <span aria-hidden="true"> · </span>Session only
          </span>
        </div>
      </div>
      <div className="header-tools">
        <button className="help-button" aria-label="Try a look" aria-pressed={looksOpen} onClick={onToggleLooks}>
          <StudioIcon name="sun" size={18} />
          <span>Try a look</span>
        </button>
        <div className="history-tools">
          <button aria-label="Undo" title="Undo (⌘/Ctrl Z)" disabled={!canUndo} onClick={() => undo()}>
            <UndoIcon />
          </button>
          <button aria-label="Redo" title="Redo (⌘/Ctrl Shift Z)" disabled={!canRedo} onClick={() => redo()}>
            <RedoIcon />
          </button>
        </div>
        <button className="help-button" aria-label="A little help" onClick={onHelp}>
          <StudioIcon name="help" size={18} />
          <span>A little help</span>
        </button>
      </div>
    </header>
  )
}
