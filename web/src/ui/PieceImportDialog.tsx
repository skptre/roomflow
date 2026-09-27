import { useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
import { designStore } from '../domain/designStore'
import { formatDimensions } from '../domain/labels'
import { MAX_PIECE_BYTES, parsePiece, verifyPiecePhotos, pieceAsset, pieceObject, type PiecePackage } from '../import/piece'
import { FurnitureThumbnail } from './FurnitureThumbnail'

/** Reviews a phone-exported piece and owns only its own reversible room preview. */
export function PieceImportDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const serial = useRef(0)
  const own = useRef<ReturnType<typeof designStore.getState>['preview']>(null)
  const [ownedPreview, setOwnedPreview] = useState<ReturnType<typeof designStore.getState>['preview']>(null)
  const committed = useStore(designStore, (state) => state.committed)
  const preview = useStore(designStore, (state) => state.preview)
  const [loaded, setLoaded] = useState<{ piece: PiecePackage; revision: number } | null>(null)
  const [owned, setOwned] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const active = preview !== null && preview === ownedPreview
  const stale = loaded !== null && loaded.revision !== committed?.revision
  useEffect(() => {
    const opener = document.activeElement; const element = dialog.current
    element?.showModal()
    return () => {
      // Invalidate file reads and release this dialog's preview, never another tool's.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      serial.current++
      if (own.current && designStore.getState().preview === own.current) designStore.getState().cancelPreview()
      element?.close(); if (opener instanceof HTMLElement) opener.focus()
    }
  }, [])
  function cancelPreview() {
    if (own.current && designStore.getState().preview === own.current) designStore.getState().cancelPreview()
    own.current = null; setOwnedPreview(null)
  }
  async function choose(file?: File) {
    if (!file) return
    const request = ++serial.current
    const revision = designStore.getState().committed?.revision
    cancelPreview(); setLoaded(null); setError(''); setBusy(true); setOwned(false)
    try {
      if (file.size > MAX_PIECE_BYTES) throw new Error('Choose a piece package smaller than 7 MB.')
      const piece = parsePiece(await file.text())
      await verifyPiecePhotos(piece)
      if (request !== serial.current || revision === undefined) return
      setLoaded({ piece, revision })
    } catch (error) { if (request === serial.current) setError(error instanceof Error ? error.message : 'Unable to open this piece.') }
    finally { if (request === serial.current) setBusy(false) }
  }
  function tryPiece() {
    if (!loaded || stale || !committed) return
    try {
      const object = pieceObject(committed.room, loaded.piece, owned)
      const result = designStore.getState().startPreview([{ type: 'add', object }], { actor: 'auto', baseRevision: loaded.revision })
      if (!result.ok) throw new Error(result.error)
      own.current = designStore.getState().preview; setOwnedPreview(own.current); setError('')
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to preview this piece.') }
  }
  function add() {
    if (!active || stale) return
    const result = designStore.getState().commitPreview()
    if (!result.ok) { setError(result.error); return }
    own.current = null; onClose()
  }
  const duplicate = loaded && committed?.room.objects.some((object) => object.foundItemId === loaded.piece.id)
  return <dialog ref={dialog} className={`help-dialog appearance-dialog discovery-dialog ${active ? 'discovery-preview' : ''}`} aria-labelledby="piece-title" onCancel={onClose}>
    <div className="help-body">
      <button className="dialog-close" onClick={onClose} aria-label="Close piece import">×</button>
      <span className="eyebrow">FROM YOUR PHONE TO YOUR ROOM</span>
      <h2 id="piece-title">Bring in a scanned piece</h2>
      <p>On your iPhone, choose Scan a piece, review it, then share its piece file here. Your existing room stays yours.</p>
      <label className="appearance-file">Choose a piece file<input type="file" accept=".roomflow-piece.json,application/json" disabled={busy} onChange={(event) => { void choose(event.target.files?.[0]); event.target.value = '' }} /></label>
      {busy && <p role="status">Opening your piece…</p>}
      {error && <p role="alert">{error}</p>}
      {loaded && <section className="appearance-result">
        <h3>{loaded.piece.name}</h3>
        <FurnitureThumbnail asset={pieceAsset(loaded.piece)} category={loaded.piece.category} dimensions={loaded.piece.dimensions} />
        <p>{formatDimensions(loaded.piece.dimensions)} · width × depth × height</p>
        <p>{loaded.piece.dimensions.source === 'captured' ? 'Measured by the phone' : loaded.piece.dimensions.source === 'user' ? 'Dimensions you supplied' : 'Estimated dimensions — cannot confirm fit'}</p>
        <p>{pieceAsset(loaded.piece).kind === 'placeholder' ? 'No matching shape yet — shown as a size placeholder' : 'Approximate shape based on its scanned category'}</p>
        {loaded.piece.photos.length > 0 && <div className="piece-photos">{loaded.piece.photos.map((photo, index) => <img key={index} src={`data:image/jpeg;base64,${photo.data}`} alt={`Reference view ${index + 1} of ${loaded.piece.name}`} />)}</div>}
        <p className="appearance-disclosure">Photos are viewed locally. This import sends nothing to Gemini. Price is unknown; owned pieces add no new cost.</p>
        <div className="discovery-details">
          <label className="appearance-consent"><input type="checkbox" checked={owned} onChange={(event) => { cancelPreview(); setOwned(event.target.checked) }} />I already own this piece</label>
          {duplicate && <p role="status">This piece is already in your room. Adding it again creates a separate copy.</p>}
          {active && <p role="status">Trying it in your room — nothing is added yet</p>}
          {stale ? <p role="status">Your room changed. Choose the file again to preview against the current design.</p> : <div className="appearance-actions"><button className="studio-secondary" onClick={active ? cancelPreview : tryPiece}>{active ? 'Cancel preview' : 'Try in my room'}</button><button className="studio-primary" disabled={!active} onClick={add}>{duplicate ? 'Add another copy' : 'Add to my room'}</button></div>}
        </div>
      </section>}
      <button className="studio-secondary full-width" onClick={onClose}>Back to my room</button>
    </div>
  </dialog>
}
