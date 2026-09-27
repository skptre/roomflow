import { AnimatePresence } from 'motion/react'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useStore } from 'zustand'
import { catalogSource, catalogStore } from './catalog/appCatalog'
import { designStore, viewRoom } from './domain/designStore'
import { budgetForChoice, type SummarySources } from './domain/purchases'
import { demoRoom } from './fixtures/demoRoom'
import { originalRoom } from './fixtures/originalRoom'
import { MAX_IMPORT_BYTES, parseRoomPlanJson, type ImportResult } from './import/roomplan'
import { isZipArchive, MAX_PACKAGE_BYTES, parseRoomflowPackage, type PackageImportResult } from './import/roomflowPackage'
import { RoomScene } from './scene/RoomScene'
import type { ViewRequest } from './scene/CameraRig'
import type { Room } from './domain/schema'
import type { PreparedItem } from './recognition/autoMatch'
import { prepareAutoMatch } from './recognition/cropPhoto'
import { AutoMatchDialog } from './ui/AutoMatchDialog'
import { CatalogPanel } from './ui/CatalogPanel'
import { evidenceStore } from './ui/evidenceStore'
import { cancelCatalogPreview } from './ui/catalogActions'
import { PieceImportDialog } from './ui/PieceImportDialog'
import { AppearanceDialog } from './ui/AppearanceDialog'
import { HelpDialog } from './ui/HelpDialog'
import { Inspector } from './ui/Inspector'
import { cancelActivePreview } from './ui/lookActions'
import { NoticeBar } from './ui/NoticeBar'
import { noticeStore } from './ui/noticeStore'
import { RoomPanel } from './ui/RoomPanel'
import { StartScreen } from './ui/StartScreen'
import { StudioIcon } from './ui/StudioIcon'
import { SubtotalBar } from './ui/SubtotalBar'
import { ThemePicker } from './ui/ThemePicker'
import { TopBar } from './ui/TopBar'
import { useEditorShortcuts } from './ui/useEditorShortcuts'

const sampleResult = demoRoom()
const sampleRoom = sampleResult.ok ? sampleResult.room : null
const originalResult = originalRoom()
const originalPreview = originalResult.ok ? originalResult.room : sampleRoom
const BlockSheet = lazy(() => import('./scene/dev/BlockSheet').then((m) => ({ default: m.BlockSheet })))
const blocksParam = new URLSearchParams(window.location.search).get('blocks')
const blocksFilter = (new URLSearchParams(window.location.search).get('v') ?? '').split(',').filter(Boolean)
const blocksImage = new URLSearchParams(window.location.search).get('img')
const LineupSheet = lazy(() => import('./scene/dev/LineupSheet').then((m) => ({ default: m.LineupSheet })))
const lineupParam = new URLSearchParams(window.location.search).get('lineup')

export default function App() {
  if (lineupParam !== null)
    return (
      <main className="relative h-full w-full overflow-auto">
        <Suspense fallback={null}>
          <LineupSheet page={Math.max(1, Number(lineupParam) || 1)} />
        </Suspense>
      </main>
    )
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
  const [autoMatch, setAutoMatch] = useState<{ items: PreparedItem[]; model: string } | null>(null)
  const [looksOpen, setLooksOpen] = useState(false)
  const [welcome, setWelcome] = useState(true)
  const [panel, setPanel] = useState<'room' | 'catalog'>('room')
  const [swapId, setSwapId] = useState<string | null>(null)
  const [pieceImport, setPieceImport] = useState(false)
  const [discovery, setDiscovery] = useState(false)
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
  function open(result: ImportResult | PackageImportResult): boolean {
    if (!result.ok) {
      setError(result.error)
      return false
    }
    setError(null)
    cancelCatalogPreview()
    designStore.getState().loadRoom(result.room)
    evidenceStore.getState().set(result.room.id, 'evidence' in result ? result.evidence : null)
    setWelcome(false)
    setPanel('room')
    setSwapId(null)
    announceImport(result)
    offerAutoMatch(result.room)
    return true
  }
  /** After a package opens, offers to match every photographed item (nothing is sent without consent). */
  function offerAutoMatch(opened: Room) {
    setAutoMatch(null)
    const evidence = evidenceStore.getState()
    if (!evidence.evidence || evidence.evidence.photos.length === 0) return
    void prepareAutoMatch(opened, evidence.regionsFor).then((offer) => {
      // Only offer for the room that is still open.
      if (offer && designStore.getState().committed?.room.id === opened.id && evidenceStore.getState().roomId === opened.id) setAutoMatch(offer)
    })
  }
  /** Tells the user what came in with the room and anything the importer had to estimate or skip. */
  function announceImport(result: Extract<ImportResult | PackageImportResult, { ok: true }>) {
    const parts: string[] = []
    if ('evidence' in result) {
      const { photos, annotations } = result.evidence
      parts.push(`Room package opened with ${photos.length} reference photo${photos.length === 1 ? '' : 's'}` +
        (annotations.length > 0 ? ` and ${annotations.length} name${annotations.length === 1 ? '' : 's'} from your phone.` : '.'))
    }
    if (result.warnings.length > 0) {
      parts.push(result.warnings[0]! + (result.warnings.length > 1 ? ` (+${result.warnings.length - 1} more)` : ''))
    }
    if (parts.length > 0) noticeStore.getState().show(parts.join(' '), result.warnings.length > 0 ? 'warning' : 'info')
  }
  async function importFile(file: File) {
    if (file.size > MAX_PACKAGE_BYTES) {
      setError(`This file is too large. Choose a scan smaller than ${MAX_PACKAGE_BYTES / (1024 * 1024)} MB.`)
      return
    }
    setBusy(true)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      if (isZipArchive(bytes)) {
        open(await parseRoomflowPackage(bytes))
      } else if (bytes.length > MAX_IMPORT_BYTES) {
        setError(`This file is too large. Choose a scan smaller than ${MAX_IMPORT_BYTES / (1024 * 1024)} MB.`)
      } else {
        open(parseRoomPlanJson(new TextDecoder().decode(bytes)))
      }
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
          onOpenSample={() => open(demoRoom())}
          onResume={committed ? () => setWelcome(false) : undefined}
        >
          {originalPreview && <RoomScene room={originalPreview} sources={sources} decorative heroLoop />}
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
              <button onClick={cancelActivePreview}>Cancel</button>
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
          <div className="pointer-events-none absolute inset-x-4 bottom-20 z-10 flex items-end justify-center">
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
                onImportPiece={() => { cancelActivePreview(); setLooksOpen(false); setPieceImport(true) }}
                onAddPhoto={() => { cancelActivePreview(); setLooksOpen(false); setDiscovery(true) }}
              />
            )}
          </div>
          <SubtotalBar sources={sources} />
        </aside>
      </div>
      {pieceImport && <PieceImportDialog onClose={() => setPieceImport(false)} />}
      {discovery && <AppearanceDialog onClose={() => setDiscovery(false)} />}
      {help && <HelpDialog onClose={() => setHelp(false)} />}
      {autoMatch && <AutoMatchDialog items={autoMatch.items} model={autoMatch.model} onClose={() => setAutoMatch(null)} />}
    </main>
  )
}
