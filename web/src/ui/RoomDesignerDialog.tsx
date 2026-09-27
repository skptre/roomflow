import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useStore } from 'zustand'
import type { CatalogEntry } from '../domain/catalog'
import { designStore, type Preview } from '../domain/designStore'
import { formatMoney } from '../domain/money'
import type { PurchaseRow, SummarySources } from '../domain/purchases'
import { roomSummary } from '../roomDesigner/contract'
import { noticeStore } from './noticeStore'
import {
  applyRoomDesignerPreview,
  beginRoomDesignerPreview,
  cancelRoomDesignerPreview,
  ownedRoomDesignerPreview,
  parseBudgetInput,
  prepareRoomDesign,
  requestRoomDesign,
  type PreparedRoomDesign,
} from './roomDesignerActions'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY']

function majorUnits(amountMinor: number, currency: string): string {
  const digits = new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
  return digits === 0 ? String(amountMinor) : `${Math.floor(amountMinor / 10 ** digits)}.${String(amountMinor % 10 ** digits).padStart(digits, '0')}`
}

function rowText(row: PurchaseRow): string {
  const price = row.lineTotal ? formatMoney(row.lineTotal) : 'Price unknown'
  return `${row.quantity > 1 ? `${row.quantity} × ` : ''}${row.name}${row.variantLabel ? ` (${row.variantLabel})` : ''} · ${price}`
}

/**
 * Composer for a text-only Gemini room design. Owns only its own preview: Escape,
 * close, and Discard cancel exactly that preview; Apply commits it as one undoable
 * step and is refused once the room has changed.
 */
export function RoomDesignerDialog({
  catalog,
  catalogStatus,
  sources,
  onClose,
}: {
  catalog: readonly CatalogEntry[]
  catalogStatus: 'idle' | 'loading' | 'ready' | 'error'
  sources: SummarySources
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const request = useRef<AbortController | null>(null)
  const committed = useStore(designStore, (state) => state.committed)
  const preview = useStore(designStore, (state) => state.preview)
  const [brief, setBrief] = useState('')
  const [amount, setAmount] = useState(() => (committed?.budget ? majorUnits(committed.budget.amountMinor, committed.budget.currency) : ''))
  const [currency, setCurrency] = useState(committed?.budget?.currency ?? 'USD')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [prepared, setPrepared] = useState<PreparedRoomDesign | null>(null)
  const [ownedPreview, setOwnedPreview] = useState<Preview | null>(null)
  const active = preview !== null && preview === ownedPreview
  const stale = prepared !== null && prepared.proposal.baseRevision !== committed?.revision
  const currencies = CURRENCIES.includes(currency) ? CURRENCIES : [currency, ...CURRENCIES]

  useEffect(() => {
    const opener = document.activeElement
    const element = dialog.current
    element?.showModal()
    return () => {
      request.current?.abort()
      cancelRoomDesignerPreview()
      element?.close()
      if (opener instanceof HTMLElement) opener.focus()
    }
  }, [])

  function discardPreview() {
    cancelRoomDesignerPreview()
    setOwnedPreview(null)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const current = designStore.getState().committed
    if (!current || busy) return
    const budget = parseBudgetInput(amount, currency)
    if (!budget.ok) { setError(budget.error); return }
    if (!consent) { setError('Agree to send your request and room summary to Google Gemini first.'); return }
    discardPreview(); setPrepared(null); setError(''); setBusy(true)
    const controller = new AbortController()
    request.current = controller
    const baseRevision = current.revision
    const result = await requestRoomDesign(
      { brief: brief.trim(), consent: true, baseRevision, roomSummary: roomSummary(current.room), ...(budget.budget ? { budget: { amountMinor: budget.budget.amountMinor, currency: budget.budget.currency } } : {}) },
      current.room,
      { signal: controller.signal },
    )
    if (controller.signal.aborted) return
    setBusy(false)
    if (!result.ok) { setError(result.error); return }
    const latest = designStore.getState().committed
    if (!latest || latest.revision !== baseRevision) {
      setError('Your room changed while the design was being prepared. Ask again to design from your current room.')
      return
    }
    try {
      setPrepared(prepareRoomDesign(result.intent, { room: current.room, catalog, budget: budget.budget, baseRevision, sources }))
    } catch {
      setError('This design could not be matched to your room. Try again. Your room is unchanged.')
    }
  }

  function tryDesign() {
    if (!prepared || stale) return
    const result = beginRoomDesignerPreview(prepared.proposal)
    if (!result.ok) { setError(result.error); setOwnedPreview(null); return }
    setError('')
    setOwnedPreview(ownedRoomDesignerPreview())
  }

  function apply() {
    if (!prepared || !active) return
    const result = applyRoomDesignerPreview(prepared.proposal)
    setOwnedPreview(null)
    if (!result.ok) { setError(result.error); return }
    noticeStore.getState().show('Your new design is applied. Undo to go back.')
    onClose()
  }

  function discard() {
    discardPreview()
    setPrepared(null)
    setError('')
  }

  const proposal = prepared?.proposal
  const cost = prepared?.cost
  return (
    <dialog
      ref={dialog}
      className={`help-dialog appearance-dialog discovery-dialog designer-dialog ${active ? 'discovery-preview' : ''}`}
      aria-labelledby="designer-title"
      onCancel={onClose}
    >
      <div className="help-body">
        <button className="dialog-close" onClick={onClose} aria-label="Close room designer">×</button>
        <span className="eyebrow">TRY A WHOLE NEW VERSION</span>
        <h2 id="designer-title">Design with Gemini</h2>
        <p>Describe the room you want. We’ll suggest real catalog pieces and a new arrangement you can try before anything changes.</p>
        <form className="designer-form" onSubmit={(event) => void submit(event)} aria-busy={busy}>
          <label className="designer-field">
            What would you like?
            <textarea
              value={brief}
              maxLength={600}
              rows={3}
              disabled={busy}
              placeholder="Make it darker and cozier, with a reading chair by the window"
              onChange={(event) => setBrief(event.target.value)}
              required
            />
          </label>
          <fieldset className="designer-budget" disabled={busy}>
            <legend>Spending limit (optional)</legend>
            <label>
              Amount
              <input inputMode="decimal" value={amount} placeholder="No limit" onChange={(event) => setAmount(event.target.value)} />
            </label>
            <label>
              Currency
              <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
                {currencies.map((code) => <option key={code} value={code}>{code}</option>)}
              </select>
            </label>
          </fieldset>
          <p className="appearance-disclosure">
            Your words, the spending limit, and a room summary (room shape, doors and windows, and each piece’s type, size, color and position) go to Google Gemini. <strong>No photos are sent.</strong> Names, prices and store links stay on this computer. One request, no automatic retries; a typical request costs a fraction of a cent.
          </p>
          <label className="appearance-consent">
            <input type="checkbox" checked={consent} disabled={busy} onChange={(event) => setConsent(event.target.checked)} />
            Send this request and room summary to Google Gemini
          </label>
          {catalogStatus !== 'ready' && <p className="appearance-disclosure" role="status">{catalogStatus === 'error' ? 'The catalog couldn’t load, so new pieces will be skipped. Palette and layout changes still work.' : 'The catalog is still loading, so new pieces may be skipped.'}</p>}
          <button className="studio-primary full-width" type="submit" disabled={busy || !consent || !brief.trim()}>
            {busy ? 'Designing your room…' : 'Design my room'}
          </button>
          {busy && <p role="status" className="appearance-disclosure">Asking Gemini for a plan. Your room stays as it is.</p>}
        </form>
        {error && <p role="alert" className="appearance-message">{error}</p>}
        {prepared && proposal && cost && (
          <section className="appearance-result designer-result" aria-live="polite" aria-labelledby="designer-result-title">
            <h3 id="designer-result-title">{prepared.description.summary}</h3>
            {prepared.description.notes.length > 0 && (
              <ul className="designer-list">{prepared.description.notes.map((note, index) => <li key={index}>{note}</li>)}</ul>
            )}
            <div className="designer-group">
              <h4>What will change</h4>
              {proposal.notes.length > 0
                ? <ul className="designer-list">{proposal.notes.map((note, index) => <li key={index}>{note}</li>)}</ul>
                : <p>Nothing in this plan could be applied safely.</p>}
            </div>
            {(proposal.skipped.length > 0 || proposal.warnings.length > 0) && (
              <div className="designer-group designer-skipped">
                <h4>Not included</h4>
                <ul className="designer-list">
                  {[...proposal.warnings, ...proposal.skipped].map((note, index) => <li key={index}>{note}</li>)}
                </ul>
              </div>
            )}
            <div className="designer-group">
              <h4>Cost</h4>
              {cost.added.length > 0 && <p>New to buy: {cost.added.map(rowText).join('; ')}</p>}
              {cost.removed.length > 0 && <p>No longer buying: {cost.removed.map(rowText).join('; ')}</p>}
              {cost.added.length === 0 && cost.removed.length === 0 && <p>No purchase changes.</p>}
              {cost.unknownPrices > 0 && <p>{cost.unknownPrices} {cost.unknownPrices === 1 ? 'item has' : 'items have'} an unknown price.</p>}
            </div>
            <div className="discovery-details">
              <p role="status" className="designer-total">
                Product subtotal: <strong>{cost.totalText}</strong> · {cost.budgetText}
              </p>
              {active && <p role="status">Trying it in your room — nothing has changed yet.</p>}
              {stale ? (
                <p role="status">Your room changed since this design was prepared. Ask again to design from your current room.</p>
              ) : (
                <div className="appearance-actions">
                  <button className="studio-secondary" onClick={active ? discardPreview : tryDesign} disabled={proposal.commands.length === 0}>
                    {active ? 'Stop previewing' : 'Preview design'}
                  </button>
                  <button className="studio-primary" disabled={!active} onClick={apply}>Apply design</button>
                  <button className="studio-secondary" onClick={discard}>Discard</button>
                </div>
              )}
            </div>
          </section>
        )}
        <button className="studio-secondary full-width" onClick={onClose}>{busy ? 'Close and stop waiting' : 'Back to my room'}</button>
        {busy && <p className="appearance-disclosure">A request already sent to Google may still complete and incur a charge.</p>}
      </div>
    </dialog>
  )
}
