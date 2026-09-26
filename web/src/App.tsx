import { AnimatePresence } from 'motion/react'
import { lazy, Suspense, useState } from 'react'
import { useStore } from 'zustand'
import { designStore, viewRoom, type PurchaseSources } from './domain/designStore'
import sampleScan from './fixtures/synthetic-bedroom.roomplan.json?raw'
import { MAX_IMPORT_BYTES, parseRoomPlanJson } from './import/roomplan'
import { Backdrop } from './scene/Backdrop'
import { RoomScene } from './scene/RoomScene'
import { Inspector } from './ui/Inspector'
import { NoticeBar } from './ui/NoticeBar'
import { StartScreen } from './ui/StartScreen'
import { TopBar } from './ui/TopBar'
import { useEditorShortcuts } from './ui/useEditorShortcuts'

/** No catalog is connected yet; prices come in with the sample catalog. */
const NO_SOURCES: PurchaseSources = { offers: new Map() }

const AssetLineup = lazy(() => import('./scene/dev/AssetLineup').then((m) => ({ default: m.AssetLineup })))
const showLineup = new URLSearchParams(window.location.search).has('lineup')

export default function App() {
  if (showLineup) {
    return (
      <main className="relative h-full w-full overflow-hidden">
        <Suspense fallback={null}>
          <AssetLineup />
        </Suspense>
      </main>
    )
  }
  return <Workspace />
}

function Workspace() {
  // The scene shows the preview when one is active, otherwise the committed room.
  const room = useStore(designStore, viewRoom)
  const selected = useStore(designStore, (state) => {
    const shown = viewRoom(state)
    return shown?.objects.find((object) => object.id === state.selectedId) ?? null
  })
  useEditorShortcuts()
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
          <RoomScene room={room} sources={NO_SOURCES} />
          <TopBar room={room} />
          <div className="pointer-events-none absolute top-18 right-4 flex flex-col items-end gap-3">
            <AnimatePresence>
              {selected ? <Inspector key={selected.id} object={selected} sources={NO_SOURCES} /> : null}
            </AnimatePresence>
          </div>
          <NoticeBar />
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
