import { useState } from 'react'
import { useStore } from 'zustand'
import { designStore } from './domain/designStore'
import sampleScan from './fixtures/synthetic-bedroom.roomplan.json?raw'
import { MAX_IMPORT_BYTES, parseRoomPlanJson } from './import/roomplan'
import { Backdrop } from './scene/Backdrop'
import { RoomScene } from './scene/RoomScene'
import { StartScreen } from './ui/StartScreen'

export default function App() {
  const room = useStore(designStore, (state) => state.committed?.room ?? null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function open(text: string) {
    const result = parseRoomPlanJson(text)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    designStore.getState().loadRoom(result.room)
  }

  async function importFile(file: File) {
    if (file.size > MAX_IMPORT_BYTES) {
      setError(`This file is too large to import (limit ${MAX_IMPORT_BYTES / (1024 * 1024)} MB).`)
      return
    }
    setBusy(true)
    try {
      open(await file.text())
    } catch {
      setError("This file couldn't be read.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="relative h-full w-full overflow-hidden">
      {room ? (
        <>
          <RoomScene room={room} />
          <header className="pointer-events-none absolute top-4 left-4 flex items-center gap-2">
            <h1 className="rounded-pill bg-surface/90 px-3 py-1.5 text-sm font-medium text-ink shadow-panel backdrop-blur">
              {room.name}
            </h1>
            {room.source.kind === 'synthetic' ? (
              <span className="rounded-pill bg-surface-sunken/90 px-2 py-1 text-xs font-medium text-muted shadow-panel">
                Synthetic sample
              </span>
            ) : null}
          </header>
        </>
      ) : (
        <>
          <Backdrop />
          <StartScreen error={error} busy={busy} onImportFile={importFile} onOpenSample={() => open(sampleScan)} />
        </>
      )}
    </main>
  )
}
