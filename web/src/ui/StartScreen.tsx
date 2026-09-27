import { useId, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { StudioIcon, Wordmark } from './StudioIcon'
import { PairScanDialog } from './PairScanDialog'

type StartScreenProps = {
  onImportFile: (file: File) => void
  onOpenSample: () => void
  onPairedScan: (scan: string) => boolean
  onResume?: () => void
  error?: string | null
  busy?: boolean
  children: ReactNode
}

export function StartScreen({ onImportFile, onOpenSample, onPairedScan, onResume, error, busy = false, children }: StartScreenProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [pairing, setPairing] = useState(false)
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
            <button className="studio-primary" disabled={busy} onClick={onOpenSample}>
              Explore sample room
              <StudioIcon name="arrow" />
            </button>
            <button
              className="welcome-import"
              disabled={busy}
              onClick={() => setPairing(true)}
            >
              <StudioIcon name="grid" size={18} />
              Open my scan
              <StudioIcon name="arrow" size={17} />
            </button>
            <p className="scan-handoff">Connect the Roomflow iPhone app. Your scan appears here when it finishes.</p>
            <button className="saved-scan-link" disabled={busy} aria-describedby={error ? errorId : undefined}
              onClick={() => inputRef.current?.click()}>Use a saved scan file</button>
            <input
              ref={inputRef}
              type="file"
              accept=".json,application/json"
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
          {onResume && <button className="welcome-resume" onClick={onResume}>Return to my room</button>}
        </section>
        <div className="welcome-room" aria-label="Sample bedroom preview">
          <div className="welcome-scene">{children}</div>
        </div>
      </div>
      {dragging && (
        <div className="drop-overlay">
          <StudioIcon name="upload" size={40} />
          <h2>Your room belongs here</h2>
          <p>Drop your RoomPlan .json scan to begin.</p>
        </div>
      )}
      {pairing && <PairScanDialog onClose={() => setPairing(false)} onReceive={onPairedScan} />}
    </div>
  )
}
