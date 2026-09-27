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
  const [leaving, setLeaving] = useState(false)
  const errorId = useId()
  function enterRoom(action: () => void) {
    if (leaving || busy) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      action()
      return
    }
    setLeaving(true)
    window.setTimeout(action, 340)
  }
  function handleDrop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    if (!busy && event.dataTransfer.files[0]) onImportFile(event.dataTransfer.files[0])
  }
  return (
    <div
      className={`welcome ${dragging ? 'is-dragging' : ''} ${leaving ? 'is-leaving' : ''}`}
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
      </header>
      <div className="welcome-content">
        <section className="welcome-copy" aria-labelledby="start-title">
          <h1 id="start-title">
            Your room,
            <br />
            with anything
            <br />
            you find.
          </h1>
          <p className="welcome-description">
            Try furniture in a 3D version of your room. Move pieces around and see what works.
          </p>
          <div className="welcome-actions">
            <button className="studio-primary" disabled={busy || leaving} onClick={() => enterRoom(onOpenSample)}>
              Explore sample room
              <StudioIcon name="arrow" />
            </button>
            <button
              className="welcome-import"
              disabled={busy}
              aria-describedby={error ? errorId : undefined}
              onClick={() => inputRef.current?.click()}
            >
              <StudioIcon name="upload" size={18} />
              Open my scan
              <StudioIcon name="arrow" size={17} />
            </button>
            <p className="scan-handoff">Share a RoomPlan .json scan or RoomFlow .zip package from your iPhone, then open the saved file here.</p>
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
          {onResume && <button className="welcome-resume" onClick={() => enterRoom(onResume)}>Return to my room</button>}
        </section>
        <div className="welcome-room" aria-label="Sample bedroom preview">
          <div className="welcome-scene">{children}</div>
        </div>
      </div>
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
