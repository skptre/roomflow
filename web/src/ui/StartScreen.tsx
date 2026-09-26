import { useId, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { StudioIcon, Wordmark } from './StudioIcon'

type StartScreenProps = {
  onImportFile: (file: File) => void
  onOpenSample: () => void
  onResume?: () => void
  error?: string | null
  busy?: boolean
  children: ReactNode
}

export function StartScreen({ onImportFile, onOpenSample, onResume, error, busy = false, children }: StartScreenProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const errorId = useId()
  function handleDrop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    if (!busy && event.dataTransfer.files[0]) onImportFile(event.dataTransfer.files[0])
  }
  return (
    <div
      className={`welcome ${dragging ? 'is-dragging' : ''}`}
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={handleDrop}
    >
      <header className="welcome-header">
        <Wordmark />
        <span className="welcome-note">
          <StudioIcon name="leaf" size={16} /> A space to make your own
        </span>
      </header>
      <div className="welcome-content">
        <section className="welcome-copy" aria-labelledby="start-title">
          <div className="eyebrow">
            <span className="tiny-line" /> YOUR VERY OWN DESIGN STUDIO
          </div>
          <h1 id="start-title">
            Your room,
            <br />
            your way
          </h1>
          <p className="welcome-description">
            See how a new piece fits. Move your favorites around. Explore the possibilities, right in your own room.
          </p>
          <div className="welcome-actions">
            <button className="studio-primary" disabled={busy} onClick={onResume ?? onOpenSample}>
              {onResume ? 'Back to my room' : 'Make yourself at home'}
              <StudioIcon name="arrow" />
            </button>
            <p className="action-caption">
              {onResume
                ? 'Pick up where you left off in this session.'
                : 'Start with our sample bedroom. No scan needed.'}
            </p>
            <button
              className="welcome-import"
              disabled={busy}
              aria-describedby={error ? errorId : undefined}
              onClick={() => inputRef.current?.click()}
            >
              <StudioIcon name="upload" size={18} />
              {busy ? 'Opening your room…' : 'Bring in my own room'}
              <span>RoomPlan .json or RoomFlow .zip</span>
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".json,application/json,.zip,application/zip"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) onImportFile(file)
                event.target.value = ''
              }}
            />
          </div>
          {error && (
            <p id={errorId} className="import-error" role="alert">
              {error}
            </p>
          )}
          <div className="welcome-values">
            <span>
              <StudioIcon name="check" size={16} /> Try things freely
            </span>
            <span>
              <StudioIcon name="check" size={16} /> Every edit is undoable
            </span>
          </div>
        </section>
        <div className="welcome-room">
          <div className="room-arch" />
          <div className="welcome-scene">{children}</div>
          <div className="room-note">
            <span className="note-script">A fresh perspective</span>
            <span>A SAMPLE BEDROOM, FULL OF POSSIBILITIES</span>
          </div>
          <div className="material-story">
            <span className="material-swatch swatch-oak" />
            <span className="material-swatch swatch-linen" />
            <span className="material-swatch swatch-clay" />
            <span>
              Good things
              <br />
              come together
            </span>
          </div>
        </div>
      </div>
      <footer className="welcome-footer">
        <span>YOUR ROOM, WITH ANYTHING YOU FIND</span>
        <span>Made for the way you live</span>
      </footer>
      {dragging && (
        <div className="drop-overlay">
          <StudioIcon name="upload" size={40} />
          <h2>Your room belongs here</h2>
          <p>Drop your RoomPlan .json scan or RoomFlow .zip package to begin.</p>
        </div>
      )}
    </div>
  )
}
