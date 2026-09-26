import { AnimatePresence } from 'motion/react'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useStore } from 'zustand'
import { catalogSource, catalogStore } from './catalog/appCatalog'
import { designStore, viewRoom } from './domain/designStore'
import { budgetForChoice, type SummarySources } from './domain/purchases'
import sampleScan from './fixtures/synthetic-bedroom.roomplan.json?raw'
import { MAX_IMPORT_BYTES, parseRoomPlanJson } from './import/roomplan'
import { RoomScene } from './scene/RoomScene'
import type { ViewRequest } from './scene/CameraRig'
import { CatalogPanel } from './ui/CatalogPanel'
import { cancelCatalogPreview } from './ui/catalogActions'
import { HelpDialog } from './ui/HelpDialog'
import { Inspector } from './ui/Inspector'
import { NoticeBar } from './ui/NoticeBar'
import { RoomPanel } from './ui/RoomPanel'
import { StartScreen } from './ui/StartScreen'
import { StudioIcon } from './ui/StudioIcon'
import { SubtotalBar } from './ui/SubtotalBar'
import { ThemePicker } from './ui/ThemePicker'
import { TopBar } from './ui/TopBar'
import { useEditorShortcuts } from './ui/useEditorShortcuts'

const sampleResult = parseRoomPlanJson(sampleScan)
const sampleRoom = sampleResult.ok ? sampleResult.room : null
const BlockSheet = lazy(() => import('./scene/dev/BlockSheet').then((m) => ({ default: m.BlockSheet })))
const blocksParam = new URLSearchParams(window.location.search).get('blocks')
const blocksFilter = (new URLSearchParams(window.location.search).get('v') ?? '').split(',').filter(Boolean)
const blocksImage = new URLSearchParams(window.location.search).get('img')

export default function App() {
  if (blocksParam !== null)
    return (
      <main className="relative h-full w-full overflow-hidden">
        <Suspense fallback={null}>
          <BlockSheet only={blocksParam || null} filter={blocksFilter} image={blocksImage} />
        </Suspense>
      </main>
    )
  return <Workspace />
}

function Workspace() {
  const room = useStore(designStore, viewRoom)
  const committed = useStore(designStore, (state) => state.committed)
  const preview = useStore(designStore, (state) => state.preview)
  const selected = useStore(
    designStore,
    (state) => state.committed?.room.objects.find((object) => object.id === state.selectedId) ?? null,
  )
  const [looksOpen, setLooksOpen] = useState(false)
  const [welcome, setWelcome] = useState(true)
  const [panel, setPanel] = useState<'room' | 'catalog'>('room')
  const [swapId, setSwapId] = useState<string | null>(null)
  const [help, setHelp] = useState(false)
  const [viewRequest, setViewRequest] = useState<ViewRequest>({ action: 'home', sequence: 0 })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const offers = useStore(catalogStore, (state) => state.offers)
  const variantLabels = useStore(catalogStore, (state) => state.variantLabels)
  const catalogEntries = useStore(catalogStore, (state) => state.entries)
  const sources: SummarySources = useMemo(() => ({ offers, variantLabels }), [offers, variantLabels])
  // Looks only propose pieces the store reports in stock at a known price, so a look's total means something.
  const lookCatalog = useMemo(
    () => catalogEntries.filter((entry) => entry.offer.available !== false && entry.offer.price !== null),
    [catalogEntries],
  )
  const hasRoom = committed !== null
  useEffect(() => {
    // Fetch the catalog once a room is open; the catalog panel shows any failure and retries.
    if (hasRoom) catalogStore.getState().load().catch(() => undefined)
  }, [hasRoom])
  const swapObject = committed?.room.objects.find((object) => object.id === swapId) ?? null
  // What the next choice may cost: a replacement gives the old piece's price back first.
  const swapTargetId = swapObject?.id
  const budgetLeft = useMemo(
    () => (committed ? budgetForChoice(committed.room, sources, committed.budget, swapTargetId) : null),
    [committed, sources, swapTargetId],
  )
  useEditorShortcuts(!welcome && room !== null)
  function showPanel(next: 'room' | 'catalog') {
    cancelCatalogPreview()
    setSwapId(null)
    setPanel(next)
  }
  function open(text: string) {
    const result = parseRoomPlanJson(text)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    cancelCatalogPreview()
    designStore.getState().loadRoom(result.room)
    setWelcome(false)
    setPanel('room')
    setSwapId(null)
  }
  async function importFile(file: File) {
    if (file.size > MAX_IMPORT_BYTES) {
      setError(`This file is too large. Choose a scan smaller than ${MAX_IMPORT_BYTES / (1024 * 1024)} MB.`)
      return
    }
    setBusy(true)
    try {
      open(await file.text())
    } catch {
      setError('We couldn’t read that file. Try choosing your room scan again.')
    } finally {
      setBusy(false)
    }
  }
  function view(action: ViewRequest['action']) {
    setViewRequest((current) => ({ action, sequence: current.sequence + 1 }))
  }
  if (welcome || !room || !committed)
    return (
      <main className="welcome-main">
        <StartScreen
          error={error}
          busy={busy}
          onImportFile={importFile}
          onOpenSample={() => open(sampleScan)}
          onResume={committed ? () => setWelcome(false) : undefined}
        >
          {sampleRoom && <RoomScene room={sampleRoom} sources={sources} decorative />}
        </StartScreen>
      </main>
    )
  return (
    <main className="studio">
      <a className="skip-link" href="#studio-sidebar">
        Skip to furniture controls
      </a>
      <TopBar
        room={committed.room}
        onHome={() => {
          cancelCatalogPreview()
          setWelcome(true)
        }}
        looksOpen={looksOpen}
        onToggleLooks={() => setLooksOpen(!looksOpen)}
        onHelp={() => setHelp(true)}
      />
      <div className="studio-body">
        <section className="room-stage" aria-label="Interactive room preview">
          <div className="room-canvas">
            <RoomScene room={room} sources={sources} viewRequest={viewRequest} onInspect={() => showPanel('room')} />
          </div>
          {preview && (
            <div className="stage-preview" role="status">
              <StudioIcon name="eye" size={17} />
              <span>Just trying it on. Your room hasn’t changed.</span>
              <button onClick={cancelCatalogPreview}>Cancel</button>
            </div>
          )}
          <div className="stage-bottom">
            <span className="scene-hint">
              <span className="hint-dot" />
              {selected ? 'Drag to find its happy place.' : 'Pick a piece. Imagine the possibilities.'}
            </span>
            <div className="view-controls" role="group" aria-label="Room view">
              <button onClick={() => view('home')} aria-label="Reset room view" title="Reset view">
                <StudioIcon name="home" size={18} />
              </button>
              <button onClick={() => view('top')} aria-label="See floor plan from above" title="View from above">
                <StudioIcon name="grid" size={17} />
              </button>
              <span />
              <button onClick={() => view('left')} aria-label="Orbit room left" title="Look left">
                ↶
              </button>
              <button onClick={() => view('right')} aria-label="Orbit room right" title="Look right">
                ↷
              </button>
              <span />
              <button onClick={() => view('zoom-out')} aria-label="Zoom out">
                <StudioIcon name="minus" size={17} />
              </button>
              <button onClick={() => view('zoom-in')} aria-label="Zoom in">
                <StudioIcon name="plus" size={17} />
              </button>
            </div>
          </div>
          <div className="pointer-events-none absolute inset-x-4 top-4 bottom-20 z-10 flex items-end justify-center">
            <AnimatePresence>
              {looksOpen ? <ThemePicker catalog={lookCatalog} sources={sources} onClose={() => setLooksOpen(false)} /> : null}
            </AnimatePresence>
          </div>
          <NoticeBar />
        </section>
        <aside className="studio-sidebar" id="studio-sidebar" tabIndex={-1}>
          <nav className="studio-tabs" aria-label="Design tools">
            <button aria-pressed={panel === 'room'} onClick={() => showPanel('room')}>
              <StudioIcon name="home" size={17} />
              Your room
            </button>
            <button aria-pressed={panel === 'catalog'} onClick={() => showPanel('catalog')}>
              <StudioIcon name="search" size={17} />
              Find a piece
            </button>
          </nav>
          <div className="sidebar-scroll">
            {panel === 'catalog' ? (
              <CatalogPanel
                source={catalogSource}
                selected={swapObject}
                budgetRemaining={budgetLeft}
                onClose={() => {
                  cancelCatalogPreview()
                  setSwapId(null)
                }}
              />
            ) : selected ? (
              <Inspector
                object={selected}
                sources={sources}
                onClose={() => designStore.getState().select(null)}
                onBrowseAlternatives={() => {
                  cancelCatalogPreview()
                  setSwapId(selected.id)
                  setPanel('catalog')
                }}
              />
            ) : (
              <RoomPanel
                room={committed.room}
                onSelect={(object) => designStore.getState().select(object.id)}
                onBrowse={() => showPanel('catalog')}
              />
            )}
          </div>
          <SubtotalBar sources={sources} />
        </aside>
      </div>
      {help && <HelpDialog onClose={() => setHelp(false)} />}
    </main>
  )
}
