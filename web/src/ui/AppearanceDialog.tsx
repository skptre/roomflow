import { useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
import { designStore } from '../domain/designStore'
import type { RoomObject } from '../domain/schema'
import { appearanceCommand } from '../recognition/appearance'
import { appearanceAsset } from '../recognition/appearanceAsset'
import { RecognitionResponse, type RecognitionResponse as Result } from '../recognition/contract'
import { FurnitureThumbnail } from './FurnitureThumbnail'

/** The canvas output is both the visible consent preview and the exact uploaded image. */
export function AppearanceDialog({ object, onClose }: { object: RoomObject; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const image = useRef<ImageBitmap | null>(null)
  const fileVersion = useRef(0)
  const request = useRef<AbortController | null>(null)
  const ownPreview = useRef<ReturnType<typeof designStore.getState>['preview']>(null)
  const [ownedPreview, setOwnedPreview] = useState<ReturnType<typeof designStore.getState>['preview']>(null)
  const revision = useStore(designStore, (state) => state.committed?.revision)
  const preview = useStore(designStore, (state) => state.preview)
  const [ready, setReady] = useState<boolean | null>(null)
  const [model, setModel] = useState('Gemini Flash-Lite')
  const [photo, setPhoto] = useState('')
  const [crop, setCrop] = useState({ zoom: 1, x: 50, y: 50 })
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ data: Result; baseRevision: number } | null>(null)
  const [error, setError] = useState('')
  const stale = result !== null && result.baseRevision !== revision
  const isPreviewing = preview !== null && preview === ownedPreview

  function clearPreview() {
    if (ownPreview.current && designStore.getState().preview === ownPreview.current) designStore.getState().cancelPreview()
    ownPreview.current = null
    setOwnedPreview(null)
  }
  useEffect(() => {
    const opener = document.activeElement
    const element = dialog.current
    element?.showModal()
    const controller = new AbortController()
    fetch('/api/recognize/status', { signal: controller.signal }).then((response) => response.json()).then((data) => {
      setReady(data.ready === true)
      if (typeof data.model === 'string') setModel(data.model)
    }).catch(() => { if (!controller.signal.aborted) setReady(false) })
    return () => {
      element?.close()
      if (opener instanceof HTMLElement) opener.focus()
      controller.abort(); request.current?.abort(); image.current?.close();
      // This counter deliberately invalidates whichever file decode is still running.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      fileVersion.current++
      if (ownPreview.current && designStore.getState().preview === ownPreview.current) designStore.getState().cancelPreview()
    }
  }, [])

  function renderPhoto(next: typeof crop) {
    const bitmap = image.current
    if (!bitmap) return
    clearPreview(); setResult(null); setConsent(false); setError('')
    const width = bitmap.width / next.zoom, height = bitmap.height / next.zoom
    const canvas = document.createElement('canvas')
    const scale = Math.min(1, 1024 / Math.max(width, height))
    canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale))
    const context = canvas.getContext('2d')
    if (!context) { setError('Your browser could not prepare the photo.'); return }
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, (bitmap.width - width) * next.x / 100, (bitmap.height - height) * next.y / 100, width, height, 0, 0, canvas.width, canvas.height)
    setPhoto(canvas.toDataURL('image/jpeg', 0.82))
  }
  async function choose(file: File | undefined) {
    if (!file) return
    const version = ++fileVersion.current
    clearPreview(); setResult(null); setPhoto(''); setConsent(false); setError('')
    image.current?.close(); image.current = null
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 15_000_000) {
      setError('Choose a JPG, PNG or WebP under 15 MB. Export HEIC photos as JPEG first.'); return
    }
    try {
      const bitmap = await createImageBitmap(file)
      if (version !== fileVersion.current) { bitmap.close(); return }
      image.current = bitmap
      const reset = { zoom: 1, x: 50, y: 50 }
      setCrop(reset); renderPhoto(reset)
    } catch { setError('This photo could not be opened. Try a JPEG export.'); }
  }
  async function analyze() {
    const baseRevision = designStore.getState().committed?.revision
    if (!photo || !consent || baseRevision === undefined || busy) return
    clearPreview(); setBusy(true); setError(''); setResult(null)
    const controller = new AbortController(); request.current = controller
    try {
      const response = await fetch('/api/recognize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ image: photo.split(',')[1], consent: true }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'Recognition is unavailable.')
      setResult({ data: RecognitionResponse.parse(body), baseRevision })
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Recognition failed. Your room is unchanged.')
    } finally { if (!controller.signal.aborted) setBusy(false) }
  }
  function showPreview() {
    if (!result || stale) return
    const outcome = designStore.getState().startPreview([appearanceCommand(object.id, result.data.appearance, result.data.model)], { actor: 'auto', baseRevision: result.baseRevision })
    if (!outcome.ok) { setError(outcome.error); return }
    ownPreview.current = designStore.getState().preview
    setOwnedPreview(ownPreview.current)
  }
  function apply() {
    if (!isPreviewing || stale) return
    const outcome = designStore.getState().commitPreview()
    if (!outcome.ok) { setError(outcome.error); return }
    ownPreview.current = null; onClose()
  }
  return (
    <dialog ref={dialog} className="help-dialog appearance-dialog" aria-labelledby="appearance-title" onCancel={onClose}>
      <div className="help-body">
        <button className="dialog-close" aria-label="Close photo matching" onClick={onClose}>×</button>
        <span className="eyebrow">YOUR FURNITURE, MORE FAMILIAR</span>
        <h2 id="appearance-title">Match its appearance</h2>
        <p>Choose a photo showing your {object.name.toLowerCase()}. We’ll suggest a shape and colors while keeping its measured size and position.</p>
        {ready === false && <p role="status" className="appearance-message">Photo matching is not connected yet. You can prepare a photo here and keep designing without AI.</p>}
        <label className="appearance-file">Choose a furniture photo
          <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => { void choose(event.target.files?.[0]); event.target.value = '' }} />
        </label>
        {photo && <>
          <img className="appearance-photo" src={photo} alt="Exact photo that will be sent to Google, after your crop" />
          <fieldset disabled={busy} className="appearance-crop"><legend>Keep only what you want to share</legend>
            {(['zoom', 'x', 'y'] as const).map((axis) => <label key={axis}>{axis === 'zoom' ? 'Zoom / crop' : axis === 'x' ? 'Horizontal position' : 'Vertical position'}
              <input type="range" min={axis === 'zoom' ? 1 : 0} max={axis === 'zoom' ? 4 : 100} step={axis === 'zoom' ? 0.1 : 1} value={crop[axis]} onChange={(event) => { const next = { ...crop, [axis]: Number(event.target.value) }; setCrop(next); renderPhoto(next) }} />
            </label>)}
          </fieldset>
          <p className="appearance-disclosure">Only the image shown above and a fixed furniture-description prompt go to Google Gemini. File metadata is removed locally. We do not save the photo on our server. Google may retain requests for abuse monitoring; paid API content is not used to improve its products. <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noreferrer">Google’s data terms</a></p>
          <label className="appearance-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={(event) => setConsent(event.target.checked)} />Send this image to Google for this analysis</label>
          <p className="appearance-disclosure">{model} · one request, no automatic retries. Typical small requests cost a fraction of a cent; the token-based estimate appears after analysis.</p>
          <button className="studio-primary full-width" disabled={!consent || ready !== true || busy} onClick={() => void analyze()}>{busy ? 'Looking at your furniture…' : 'Analyze this photo'}</button>
        </>}
        {error && <p role="alert" className="appearance-message">{error}</p>}
        {result && <section className="appearance-result" aria-live="polite">
          <h3>{result.data.appearance.template === 'unsupported' ? 'No close match yet' : 'Your approximate match'}</h3>
          <p>{result.data.appearance.explanation}</p>
          <p>Visual confidence: {result.data.appearance.confidence}. Patterns and small details are simplified.</p>
          {result.data.appearance.template !== 'unsupported' && <FurnitureThumbnail asset={appearanceAsset(result.data.appearance)} dimensions={object.dimensions} />}
          <p className="appearance-disclosure">{result.data.usage.inputTokens} input / {result.data.usage.outputTokens} output tokens · {result.data.usage.estimatedCostUsd === null ? 'Cost unavailable' : `Estimated API cost $${result.data.usage.estimatedCostUsd.toFixed(5)}`}</p>
          {stale ? <p role="status">Your room changed. Analyze again before applying a match.</p> : result.data.appearance.template !== 'unsupported' && <div className="appearance-actions">
            <button className="studio-secondary" onClick={isPreviewing ? clearPreview : showPreview}>{isPreviewing ? 'Cancel preview' : 'Preview in room'}</button>
            <button className="studio-primary" disabled={!isPreviewing} onClick={apply}>Apply appearance</button>
          </div>}
        </section>}
        <button className="studio-secondary full-width" onClick={onClose}>{busy ? 'Close and stop waiting' : 'Keep current appearance'}</button>
        {busy && <p className="appearance-disclosure">A request already sent to Google may still complete and incur a charge.</p>}
      </div>
    </dialog>
  )
}
