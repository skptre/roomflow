import { AnimatePresence } from 'motion/react'
import { lazy, Suspense, useMemo, useState } from 'react'
import { useStore } from 'zustand'
import { designStore, viewRoom } from './domain/designStore'
import { budgetForChoice, type SummarySources } from './domain/purchases'
import { sampleOffers, sampleVariantLabels } from './fixtures/sample-catalog'
import { SampleCatalogSource } from './fixtures/sample-catalog-source'
import sampleScan from './fixtures/synthetic-bedroom.roomplan.json?raw'
import { MAX_IMPORT_BYTES, parseRoomPlanJson } from './import/roomplan'
import { Backdrop } from './scene/Backdrop'
import { RoomScene } from './scene/RoomScene'
import { CatalogPanel } from './ui/CatalogPanel'
import { Inspector } from './ui/Inspector'
import { NoticeBar } from './ui/NoticeBar'
import { StartScreen } from './ui/StartScreen'
import { SubtotalBar } from './ui/SubtotalBar'
import { TopBar } from './ui/TopBar'
import { useEditorShortcuts } from './ui/useEditorShortcuts'

/** Prices and labels for placed products. Only the SAMPLE catalog is connected so far. */
const SOURCES: SummarySources = { offers: sampleOffers, variantLabels: sampleVariantLabels }
const catalogSource = new SampleCatalogSource()

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
  // Panels describe the committed object, not a hovered preview of its replacement.
  const selected = useStore(designStore, (state) => state.committed?.room.objects.find((object) => object.id === state.selectedId) ?? null)
  const committed = useStore(designStore, (state) => state.committed)
  const [catalogOpen, setCatalogOpen] = useState(false)
  // What the next choice may cost: swapping the selected item gives its own price back first.
  const selectedId = selected?.id
  const budgetLeft = useMemo(
    () => (committed ? budgetForChoice(committed.room, SOURCES, committed.budget, selectedId) : null),
    [committed, selectedId],
  )
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
          <RoomScene room={room} sources={SOURCES} />
          <TopBar room={room} catalogOpen={catalogOpen} onToggleCatalog={() => setCatalogOpen(!catalogOpen)} />
          {/* Left column: catalog above, purchases pinned below; the catalog shrinks so they never overlap. */}
          <div className="pointer-events-none absolute top-18 bottom-4 left-4 flex w-80 flex-col gap-3">
            <div className="flex min-h-0 flex-1 flex-col">
              <AnimatePresence>
                {catalogOpen ? (
                  <CatalogPanel source={catalogSource} selected={selected} budgetRemaining={budgetLeft} onClose={() => setCatalogOpen(false)} />
                ) : null}
              </AnimatePresence>
            </div>
            <SubtotalBar sources={SOURCES} />
          </div>
          <div className="pointer-events-none absolute top-18 right-4 flex flex-col items-end gap-3">
            <AnimatePresence>
              {selected ? <Inspector key={selected.id} object={selected} sources={SOURCES} onBrowseAlternatives={() => setCatalogOpen(true)} /> : null}
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
