import { useEffect, useRef, useState } from 'react'
import { designStore } from '../domain/designStore'
import type { Room } from '../domain/schema'
import {
  abortableSleep, reconcileMatches, runAutoMatch, sendToRecognizer, type ItemOutcome, type PreparedItem,
} from '../recognition/autoMatch'

type Summary = { matched: number; unsupported: string[]; failed: string[]; skipped: number; changed: number; cost: number | null }

/**
 * Offered right after a room package opens: shows the exact crops of the phone's photos that would be
 * sent, asks once, matches each item in turn, then applies every match as one undoable change.
 */
export function AutoMatchDialog({ items, model, onClose }: { items: PreparedItem[]; model: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const controller = useRef<AbortController | null>(null)
  const [included, setIncluded] = useState(() => new Set(items.map((item) => item.objectId)))
  const [consent, setConsent] = useState(false)
  const [phase, setPhase] = useState<'offer' | 'running' | 'done'>('offer')
  const [progress, setProgress] = useState({ done: 0, total: 0, waiting: false })
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState('')
  const chosen = items.filter((item) => included.has(item.objectId))

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => { controller.current?.abort(); element?.close() }
  }, [])

  function toggle(objectId: string) {
    setIncluded((current) => {
      const next = new Set(current)
      if (next.has(objectId)) next.delete(objectId)
      else next.add(objectId)
      return next
    })
  }

  async function start() {
    const committed = designStore.getState().committed
    if (!consent || chosen.length === 0 || !committed) return
    const startRoom: Room = committed.room
    const abort = new AbortController()
    controller.current = abort
    setPhase('running'); setError('')
    const outcomes = await runAutoMatch(chosen, {
      send: sendToRecognizer, sleep: abortableSleep, signal: abort.signal,
      onProgress: (done, total, waiting) => setProgress({ done, total, waiting }),
    })
    finish(startRoom, outcomes)
  }

  /** Applies whatever matched (also after Stop, since those requests were already paid for). */
  function finish(startRoom: Room, outcomes: ItemOutcome[]) {
    const now = designStore.getState().committed
    if (!now || now.room.id !== startRoom.id) { setError('A different room is open now, so nothing was changed.'); setPhase('done'); return }
    const { commands, skipped } = reconcileMatches(startRoom, now.room, outcomes)
    let matched = commands.length
    if (commands.length > 0) {
      const applied = designStore.getState().apply(commands, { actor: 'auto', baseRevision: now.revision })
      if (!applied.ok) { setError(applied.error); matched = 0 }
    }
    const name = (id: string) => items.find((item) => item.objectId === id)?.name ?? 'An item'
    const costs = outcomes.flatMap((o) => ('data' in o ? [o.data.usage.estimatedCostUsd] : []))
    setSummary({
      matched,
      unsupported: outcomes.filter((o) => o.status === 'unsupported').map((o) => name(o.objectId)),
      failed: outcomes.flatMap((o) => (o.status === 'failed' ? [`${name(o.objectId)}: ${o.error}`] : [])),
      skipped: outcomes.filter((o) => o.status === 'skipped').length,
      changed: skipped.length,
      cost: costs.length === 0 || costs.some((c) => c === null) ? null : costs.reduce<number>((sum, c) => sum + (c ?? 0), 0),
    })
    setPhase('done')
  }

  return (
    <dialog ref={dialog} className="help-dialog appearance-dialog auto-match-dialog" aria-labelledby="auto-match-title"
      onCancel={(event) => { if (phase === 'running') event.preventDefault(); else onClose() }}>
      <div className="help-body">
        {phase !== 'running' && <button className="dialog-close" aria-label="Close photo matching" onClick={onClose}>×</button>}
        <span className="eyebrow">YOUR FURNITURE, MORE FAMILIAR</span>
        <h2 id="auto-match-title">Match your furniture from your scan photos</h2>

        {phase === 'offer' && <>
          <p>Your phone photographed {items.length === 1 ? 'this item' : `these ${items.length} items`}. We can suggest a shape and colors for each, keeping its measured size and position.</p>
          <ul className="auto-match-grid" aria-label="Photos that would be sent">
            {items.map((item) => (
              <li key={item.objectId}>
                <label className={included.has(item.objectId) ? 'auto-match-tile' : 'auto-match-tile excluded'}>
                  <img src={item.image} alt={`Photo of your ${item.name.toLowerCase()} that would be sent`} />
                  <span><input type="checkbox" checked={included.has(item.objectId)} onChange={() => toggle(item.objectId)} /> {item.name}</span>
                </label>
              </li>
            ))}
          </ul>
          <p className="appearance-disclosure">Only the checked photos above and a fixed furniture-description prompt go to Google Gemini ({model}), one request per item, sent one at a time. File metadata is removed locally and we don't save the photos on our server. Typical requests cost a fraction of a cent each. <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noreferrer">Google's data terms</a></p>
          <label className="appearance-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />Send {chosen.length === 1 ? 'this photo' : `these ${chosen.length} photos`} to Google for matching</label>
          <button className="studio-primary full-width" disabled={!consent || chosen.length === 0} onClick={() => void start()}>
            Match {chosen.length} item{chosen.length === 1 ? '' : 's'}
          </button>
          <button className="studio-secondary full-width" onClick={onClose}>Not now</button>
        </>}

        {phase === 'running' && <>
          <p role="status" aria-live="polite">
            {progress.waiting
              ? 'Pausing for a minute: photo matching allows 6 requests a minute.'
              : `Matching ${Math.min(progress.done + 1, Math.max(progress.total, 1))} of ${progress.total || chosen.length}…`}
          </p>
          <progress className="auto-match-progress" max={Math.max(progress.total, 1)} value={progress.done} />
          <button className="studio-secondary full-width" onClick={() => controller.current?.abort()}>Stop and keep what's matched</button>
          <p className="appearance-disclosure">A request already sent to Google may still complete and incur a charge.</p>
        </>}

        {phase === 'done' && summary && <section className="appearance-result" aria-live="polite">
          <h3>{summary.matched > 0 ? `Matched ${summary.matched} item${summary.matched === 1 ? '' : 's'}` : 'No items were changed'}</h3>
          {summary.matched > 0 && <p>Looks are approximate; patterns and small details are simplified. Undo reverses all of them at once.</p>}
          {summary.unsupported.length > 0 && <p>No close match yet: {summary.unsupported.join(', ')}.</p>}
          {summary.changed > 0 && <p>{summary.changed} item{summary.changed === 1 ? ' was' : 's were'} changed while matching and kept as you set {summary.changed === 1 ? 'it' : 'them'}.</p>}
          {summary.failed.length > 0 && <p>Couldn't match: {summary.failed.join('; ')}</p>}
          {summary.skipped > 0 && <p>{summary.skipped} item{summary.skipped === 1 ? ' was' : 's were'} not sent. You can match {summary.skipped === 1 ? 'it' : 'them'} one at a time from the item's details.</p>}
          <p className="appearance-disclosure">{summary.cost === null ? 'Cost unavailable' : `Estimated API cost $${summary.cost.toFixed(5)}`}</p>
        </section>}
        {error && <p role="alert" className="appearance-message">{error}</p>}
        {phase === 'done' && <button className="studio-primary full-width" onClick={onClose}>Done</button>}
      </div>
    </dialog>
  )
}
