import { useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
import { designStore } from '../domain/designStore'
import { discoveryObject, type DiscoveryDetails as Details } from '../recognition/discovery'
import type { RecognitionResponse } from '../recognition/contract'
import { appearanceAsset } from '../recognition/appearanceAsset'
import { FurnitureThumbnail } from './FurnitureThumbnail'

/** Review facts separately from AI appearance before a transactional room addition. */
export function DiscoveryDetails({ result, baseRevision, onClose }: { result: RecognitionResponse; baseRevision: number; onClose: () => void }) {
  const [details, setDetails] = useState<Details>({ name: '', width: '', height: '', depth: '', unit: 'cm', estimated: false, price: '', currency: 'USD', store: '', owned: false })
  const [error, setError] = useState('')
  const ownPreview = useRef<ReturnType<typeof designStore.getState>['preview']>(null)
  const [ownedPreview, setOwnedPreview] = useState<ReturnType<typeof designStore.getState>['preview']>(null)
  const preview = useStore(designStore, (state) => state.preview)
  const revision = useStore(designStore, (state) => state.committed?.revision)
  const active = preview !== null && preview === ownedPreview
  const stale = revision !== baseRevision
  useEffect(() => () => { if (ownPreview.current && designStore.getState().preview === ownPreview.current) designStore.getState().cancelPreview() }, [])
  function cancel() {
    if (ownPreview.current && designStore.getState().preview === ownPreview.current) designStore.getState().cancelPreview()
    ownPreview.current = null; setOwnedPreview(null)
  }
  function update<K extends keyof Details>(key: K, value: Details[K]) { cancel(); setError(''); setDetails({ ...details, [key]: value }) }
  function tryPiece() {
    const state = designStore.getState()
    if (!state.committed || stale) return
    try {
      const object = discoveryObject(state.committed.room, result.appearance, result.model, details)
      const outcome = state.startPreview([{ type: 'add', object }], { actor: 'auto', baseRevision })
      if (!outcome.ok) throw new Error(outcome.error)
      ownPreview.current = designStore.getState().preview
      setOwnedPreview(ownPreview.current)
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to place this piece.') }
  }
  function add() {
    if (!active || stale) return
    const outcome = designStore.getState().commitPreview()
    if (!outcome.ok) { setError(outcome.error); return }
    ownPreview.current = null; onClose()
  }
  return <section className="discovery-details">
    <h3>Make sure it’s your size</h3>
    <p>A photo cannot measure furniture. Use assembled dimensions from the label, or mark your estimates.</p>
    <label>Name<input value={details.name} maxLength={120} placeholder="The couch I found" onChange={(e) => update('name', e.target.value)} /></label>
    <label>Units<select value={details.unit} onChange={(e) => update('unit', e.target.value as Details['unit'])}><option value="cm">Centimeters</option><option value="in">Inches</option></select></label>
    <div className="discovery-sizes">{(['width', 'height', 'depth'] as const).map((key) => <label key={key}>{key.charAt(0).toUpperCase() + key.slice(1)}<input type="number" min="0.01" step="any" inputMode="decimal" value={details[key]} onChange={(e) => update(key, e.target.value)} /></label>)}</div>
    <label className="appearance-consent"><input type="checkbox" checked={details.estimated} onChange={(e) => update('estimated', e.target.checked)} />These dimensions are my estimates</label>
    <label>Store (optional)<input value={details.store} maxLength={120} placeholder="e.g. IKEA" onChange={(e) => update('store', e.target.value)} /></label>
    <div className="discovery-sizes"><label>Price (optional)<input inputMode="decimal" placeholder="Unknown" value={details.price} onChange={(e) => update('price', e.target.value)} /></label><label>Currency<select value={details.currency} onChange={(e) => update('currency', e.target.value)}>{['USD', 'EUR', 'GBP'].map((currency) => <option key={currency}>{currency}</option>)}</select></label></div>
    <label className="appearance-consent"><input type="checkbox" checked={details.owned} onChange={(e) => update('owned', e.target.checked)} />I already own this piece</label>
    {active && preview && <><FurnitureThumbnail asset={appearanceAsset(result.appearance)} dimensions={preview.room.objects.at(-1)!.dimensions} /><p role="status">Preview placed in your room. Existing furniture and your purchase subtotal are unchanged.</p></>}
    {details.estimated && <p>Estimated size only — this preview cannot confirm fit.</p>}
    {error && <p role="alert">{error}</p>}
    {stale ? <p role="status">Your room changed. Analyze the photo again before adding it.</p> : <div className="appearance-actions"><button className="studio-secondary" onClick={active ? cancel : tryPiece}>{active ? 'Cancel preview' : 'Try in my room'}</button><button className="studio-primary" disabled={!active} onClick={add}>Add to my room</button></div>}
    <p className="appearance-disclosure">Approximate shape and colors, not an exact product model. No product listing is created. You can move it after adding and undo in one step.</p>
  </section>
}
