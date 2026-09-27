/**
 * Spending ledger for AI calls (plan D12). Before a call, reserve its worst
 * case; refuse it if that would pass the per-call or daily cap, or if its price
 * is unknown. After the call, settle to the actual cost. Money is integer
 * micro-dollars. Every event is persisted (append-only JSONL) as it happens, so
 * after a crash a reservation that was never settled keeps counting.
 */
import type { Usage } from './rates'

export type InputClass = 'public-product' | 'user-photo'
export type RefuseReason = 'call-cap' | 'daily-cap' | 'unknown-price'

type CallInfo = { purpose: string; model: string; inputClass: InputClass }

export type LedgerEvent =
  | ({ type: 'reserve'; id: string; at: string; micros: number } & CallInfo)
  | ({ type: 'refuse'; id: string; at: string; reason: RefuseReason; micros: number | null } & CallInfo)
  | { type: 'settle'; id: string; at: string; micros: number; usage: Usage }
  | { type: 'fail'; id: string; at: string; charged: 'none' | 'unknown' }

export type CallRecord = CallInfo & {
  id: string
  at: string
  status: 'reserved' | 'settled' | 'failed' | 'refused'
  /** What counts against the cap: actual cost once settled, the reservation while open or if a failed call may have run. */
  micros: number
  usage?: Usage
  reason?: RefuseReason
}

export type LedgerOptions = {
  dailyCapMicros: number
  callCapMicros: number
  events: readonly LedgerEvent[]
  persist: (event: LedgerEvent) => void
  now?: () => Date
  newId?: () => string
}

const whole = (micros: number) => {
  if (!Number.isSafeInteger(micros) || micros < 0) throw new Error(`money must be whole non-negative micro-dollars, got ${micros}`)
  return micros
}

export class Ledger {
  private readonly calls = new Map<string, CallRecord>()
  private readonly options: Required<LedgerOptions>

  constructor(options: LedgerOptions) {
    this.options = { now: () => new Date(), newId: () => crypto.randomUUID(), ...options }
    for (const event of options.events) this.apply(event)
  }

  reserve(call: CallInfo & { worstCaseMicros: number | null }): { ok: true; id: string } | { ok: false; reason: RefuseReason } {
    const { worstCaseMicros, ...info } = call
    if (worstCaseMicros !== null) whole(worstCaseMicros)
    const id = this.options.newId()
    const at = this.options.now().toISOString()
    const reason: RefuseReason | null =
      worstCaseMicros === null
        ? 'unknown-price'
        : worstCaseMicros > this.options.callCapMicros
          ? 'call-cap'
          : this.spentTodayMicros() + worstCaseMicros > this.options.dailyCapMicros
            ? 'daily-cap'
            : null
    if (reason) {
      this.record({ type: 'refuse', id, at, reason, micros: worstCaseMicros, ...info })
      return { ok: false, reason }
    }
    this.record({ type: 'reserve', id, at, micros: worstCaseMicros!, ...info })
    return { ok: true, id }
  }

  settle(id: string, micros: number, usage: Usage): void {
    this.open(id)
    this.record({ type: 'settle', id, at: this.options.now().toISOString(), micros: whole(micros), usage })
  }

  /** `none`: the provider rejected the request (nothing billed). `unknown`: it may have run (timeout, dropped connection). */
  fail(id: string, charged: 'none' | 'unknown'): void {
    this.open(id)
    this.record({ type: 'fail', id, at: this.options.now().toISOString(), charged })
  }

  spentTodayMicros(): number {
    return this.today().reduce((sum, call) => sum + call.micros, 0)
  }

  remainingTodayMicros(): number {
    return Math.max(0, this.options.dailyCapMicros - this.spentTodayMicros())
  }

  /** Today's calls (UTC day of the call's reservation), oldest first. */
  today(): CallRecord[] {
    const day = this.options.now().toISOString().slice(0, 10)
    return [...this.calls.values()].filter((call) => call.at.slice(0, 10) === day)
  }

  private open(id: string): CallRecord {
    const call = this.calls.get(id)
    if (!call || call.status !== 'reserved') throw new Error(`no open reservation ${id}`)
    return call
  }

  private record(event: LedgerEvent): void {
    this.options.persist(event)
    this.apply(event)
  }

  private apply(event: LedgerEvent): void {
    switch (event.type) {
      case 'reserve':
        this.calls.set(event.id, { id: event.id, at: event.at, purpose: event.purpose, model: event.model, inputClass: event.inputClass, status: 'reserved', micros: event.micros })
        return
      case 'refuse':
        this.calls.set(event.id, { id: event.id, at: event.at, purpose: event.purpose, model: event.model, inputClass: event.inputClass, status: 'refused', micros: 0, reason: event.reason })
        return
      case 'settle': {
        const call = this.calls.get(event.id)
        if (call) Object.assign(call, { status: 'settled', micros: event.micros, usage: event.usage })
        return
      }
      case 'fail': {
        const call = this.calls.get(event.id)
        if (call) Object.assign(call, { status: 'failed', micros: event.charged === 'none' ? 0 : call.micros })
        return
      }
    }
  }
}

/** Events from a JSONL file; a torn or malformed line (a crash mid-write) is skipped. */
export function parseLedgerLines(text: string): LedgerEvent[] {
  const events: LedgerEvent[] = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      const event = JSON.parse(line) as LedgerEvent
      if (event && typeof event === 'object' && typeof event.id === 'string' && ['reserve', 'refuse', 'settle', 'fail'].includes(event.type)) events.push(event)
    } catch {
      // Torn line: the reservation before it (if any) stays counted.
    }
  }
  return events
}

/** A USD amount from settings ("10.00") as whole micro-dollars; null when it isn't a plain amount. */
export function usdToMicros(text: string | undefined): number | null {
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec((text ?? '').trim())
  if (!match) return null
  const micros = Number(match[1]) * 1_000_000 + Number((match[2] ?? '').padEnd(6, '0'))
  return Number.isSafeInteger(micros) ? micros : null
}
