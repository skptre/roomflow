import { useId, useRef, useState, type DragEvent } from 'react'

type StartScreenProps = {
  onImportFile: (file: File) => void
  onOpenSample: () => void
  /** Readable problem with the last attempt, shown under the actions. */
  error?: string | null
  busy?: boolean
}

/** First screen: bring in a scan or open the synthetic sample room. */
export function StartScreen({ onImportFile, onOpenSample, error, busy = false }: StartScreenProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const errorId = useId()

  const handleDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files[0]
    if (file) onImportFile(file)
  }

  return (
    <div
      className="absolute inset-0 flex items-center justify-center p-6"
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <section
        aria-labelledby="start-title"
        className={`w-full max-w-md rounded-xl bg-surface/95 p-8 shadow-float backdrop-blur transition-[outline-color] duration-[var(--duration-base)] outline-2 outline-offset-4 ${
          dragging ? 'outline-accent' : 'outline-transparent'
        }`}
      >
        <h1 id="start-title" className="font-display text-2xl font-semibold tracking-tight text-ink">
          Roomflow
        </h1>
        <p className="mt-1 text-muted">Your room, with anything you find.</p>

        <div className="mt-8 flex flex-col gap-3">
          <button
            type="button"
            disabled={busy}
            aria-describedby={error ? errorId : undefined}
            onClick={() => inputRef.current?.click()}
            className="rounded-md bg-accent px-4 py-3 text-left font-medium text-accent-ink shadow-panel transition-opacity duration-[var(--duration-fast)] hover:opacity-90 disabled:opacity-50"
          >
            Import a room scan
            <span className="block text-sm font-normal opacity-80">
              Choose or drop a RoomPlan .json file
            </span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) onImportFile(file)
              event.target.value = ''
            }}
          />

          <button
            type="button"
            disabled={busy}
            onClick={onOpenSample}
            className="flex items-center justify-between rounded-md border border-line bg-surface-raised px-4 py-3 text-left font-medium text-ink transition-colors duration-[var(--duration-fast)] hover:bg-surface-sunken disabled:opacity-50"
          >
            Open sample room
            <span className="rounded-pill bg-surface-sunken px-2 py-0.5 text-xs font-medium text-muted">
              Synthetic
            </span>
          </button>
        </div>

        {error ? (
          <p id={errorId} role="alert" className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
      </section>
    </div>
  )
}
