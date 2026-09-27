import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'

type Pairing = { id: string; browserToken: string; qr: string; server: string; expiresAt: number }

export function PairScanDialog({ onClose, onReceive }: { onClose: () => void; onReceive: (scan: string) => boolean }) {
  const [image, setImage] = useState<string | null>(null)
  const [server, setServer] = useState('')
  const [state, setState] = useState<'starting' | 'waiting' | 'error'>('starting')
  const [message, setMessage] = useState('')
  const [pairLink, setPairLink] = useState('')
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'manual'>('idle')
  const handlers = useRef({ onClose, onReceive })
  useEffect(() => { handlers.current = { onClose, onReceive } }, [onClose, onReceive])

  useEffect(() => {
    let stopped = false
    let timer: number | undefined
    let pairing: Pairing | undefined
    const controller = new AbortController()
    const closePairing = () => {
      if (pairing) void fetch(`/api/pairings/${pairing.id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${pairing.browserToken}` }, keepalive: true,
      }).catch(() => undefined)
    }
    async function poll() {
      if (stopped || !pairing) return
      try {
        const response = await fetch(`/api/pairings/${pairing.id}`, {
          headers: { Authorization: `Bearer ${pairing.browserToken}` }, signal: controller.signal,
        })
        if (!response.ok) throw new Error(response.status === 404 ? 'This code expired. Close and try again.' : 'Connection lost. Close and try again.')
        const result = await response.json() as { status: 'waiting' | 'ready'; scan?: string }
        if (result.status === 'ready' && result.scan) {
          if (handlers.current.onReceive(result.scan)) handlers.current.onClose()
          else { setMessage('The scan could not be opened. Close this code and try again.'); setState('error') }
          closePairing()
          return
        }
        if (Date.now() >= pairing.expiresAt) throw new Error('This code expired. Close and try again.')
        timer = window.setTimeout(poll, 1500)
      } catch (error) {
        if (!stopped) {
          setMessage(error instanceof Error ? error.message : 'Connection lost. Close and try again.')
          setState('error')
        }
      }
    }
    async function start() {
      try {
        const response = await fetch('/api/pairings', { method: 'POST', signal: controller.signal })
        const result = await response.json() as Pairing & { error?: string }
        if (!response.ok) throw new Error(result.error ?? 'Could not make a pairing code.')
        pairing = result
        const qr = await QRCode.toDataURL(result.qr, {
          errorCorrectionLevel: 'M', margin: 2, width: 264,
          color: { dark: '#493c34', light: '#fcfaf6' },
        })
        if (stopped) { closePairing(); return }
        setImage(qr)
        setPairLink(result.qr)
        setServer(result.server)
        setState('waiting')
        void poll()
      } catch (error) {
        if (!stopped) {
          setMessage(error instanceof Error ? error.message : 'Could not make a pairing code.')
          setState('error')
        }
      }
    }
    void start()
    return () => {
      stopped = true
      controller.abort()
      if (timer !== undefined) window.clearTimeout(timer)
      closePairing()
    }
  }, [])

  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [onClose])

  async function copyPairingLink() {
    try {
      await navigator.clipboard.writeText(pairLink)
      setCopyState('copied')
    } catch {
      setCopyState('manual')
    }
  }

  return (
    <div className="pair-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="pair-dialog" role="dialog" aria-modal="true" aria-labelledby="pair-title">
        <button className="pair-close" onClick={onClose} aria-label="Close pairing">×</button>
        <span className="pair-kicker">YOUR ROOM, TOGETHER</span>
        <h2 id="pair-title">Bring your scan here.</h2>
        <p>On your iPhone, open Roomflow and tap <strong>Connect to browser</strong>. Scan this code, then scan your room. It will open here automatically.</p>
        <div className="pair-code" aria-live="polite">
          {image ? <img src={image} alt="QR code to connect the Roomflow iPhone app to this browser" /> :
            <span>{state === 'error' ? 'Code unavailable' : 'Making your code…'}</span>}
        </div>
        {state === 'waiting' && <p className="pair-status"><span className="pair-pulse" /> Waiting for your iPhone · {server}</p>}
        {state === 'error' && <p className="pair-error" role="alert">{message}</p>}
        {pairLink && <button className="pair-copy" onClick={() => void copyPairingLink()}>
          {copyState === 'copied' ? 'Pairing link copied' : 'Copy pairing link'}
        </button>}
        {copyState === 'manual' && <label className="pair-manual-link">
          Select and copy this link on your iPhone
          <input aria-label="Pairing link" readOnly value={pairLink} onFocus={(event) => event.currentTarget.select()} />
        </label>}
        <p className="pair-footnote">Both devices need to reach the same Roomflow server. This code expires after 30 minutes.</p>
      </section>
    </div>
  )
}
