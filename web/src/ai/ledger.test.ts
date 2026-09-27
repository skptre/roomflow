import { describe, expect, it } from 'vitest'
import { Ledger, parseLedgerLines, usdToMicros, type LedgerEvent } from './ledger'

const DAY = '2026-09-26'
function setup(options: { daily?: number; perCall?: number; events?: LedgerEvent[]; at?: string } = {}) {
  const written: LedgerEvent[] = []
  let now = new Date(options.at ?? `${DAY}T12:00:00Z`)
  let n = 0
  const ledger = new Ledger({
    dailyCapMicros: options.daily ?? 10_000,
    callCapMicros: options.perCall ?? 5_000,
    events: options.events ?? [],
    persist: (event) => written.push(event),
    now: () => now,
    newId: () => `call-${++n}`,
  })
  return { ledger, written, setNow: (iso: string) => (now = new Date(iso)) }
}

const call = { purpose: 'recipe', model: 'gemini-3.8-flash', inputClass: 'public-product' as const }

describe('Ledger', () => {
  it('reserves a worst case within both caps and counts it as spent until settled', () => {
    const { ledger, written } = setup()
    const result = ledger.reserve({ ...call, worstCaseMicros: 3_000 })
    expect(result).toEqual({ ok: true, id: 'call-1' })
    expect(ledger.spentTodayMicros()).toBe(3_000)
    expect(written[0]).toMatchObject({ type: 'reserve', id: 'call-1', micros: 3_000, inputClass: 'public-product', model: 'gemini-3.8-flash' })
  })

  it('settles to the actual cost', () => {
    const { ledger } = setup()
    const reserved = ledger.reserve({ ...call, worstCaseMicros: 3_000 })
    if (!reserved.ok) throw new Error('refused')
    ledger.settle(reserved.id, 1_234, { input: 1000, output: 100, thoughts: 50 })
    expect(ledger.spentTodayMicros()).toBe(1_234)
  })

  it('refuses a call whose worst case exceeds the per-call cap, before dispatch, and records the refusal', () => {
    const { ledger, written } = setup({ perCall: 2_000 })
    expect(ledger.reserve({ ...call, worstCaseMicros: 2_001 })).toEqual({ ok: false, reason: 'call-cap' })
    expect(ledger.spentTodayMicros()).toBe(0)
    expect(written[0]).toMatchObject({ type: 'refuse', reason: 'call-cap' })
  })

  it('refuses a call that would pass the daily cap', () => {
    const { ledger } = setup({ daily: 5_000 })
    expect(ledger.reserve({ ...call, worstCaseMicros: 3_000 }).ok).toBe(true)
    expect(ledger.reserve({ ...call, worstCaseMicros: 2_001 })).toEqual({ ok: false, reason: 'daily-cap' })
    expect(ledger.reserve({ ...call, worstCaseMicros: 2_000 }).ok).toBe(true)
  })

  it('refuses a model with no known price', () => {
    const { ledger } = setup()
    expect(ledger.reserve({ ...call, worstCaseMicros: null })).toEqual({ ok: false, reason: 'unknown-price' })
  })

  it('a failed call the provider rejected costs nothing; one that may have run keeps its reservation', () => {
    const { ledger } = setup()
    const a = ledger.reserve({ ...call, worstCaseMicros: 1_000 })
    const b = ledger.reserve({ ...call, worstCaseMicros: 2_000 })
    if (!a.ok || !b.ok) throw new Error('refused')
    ledger.fail(a.id, 'none')
    ledger.fail(b.id, 'unknown')
    expect(ledger.spentTodayMicros()).toBe(2_000)
  })

  it('counts only today (UTC)', () => {
    const { ledger, setNow } = setup({ at: `${DAY}T23:59:00Z` })
    const a = ledger.reserve({ ...call, worstCaseMicros: 4_000 })
    if (!a.ok) throw new Error('refused')
    ledger.settle(a.id, 4_000, { input: 1, output: 1, thoughts: 0 })
    setNow('2026-09-27T00:01:00Z')
    expect(ledger.spentTodayMicros()).toBe(0)
  })

  it('after a crash, a reservation that was never settled still counts', () => {
    const first = setup()
    first.ledger.reserve({ ...call, worstCaseMicros: 4_000 })
    const lines = first.written.map((event) => JSON.stringify(event)).join('\n') + '\n{"type":"settle","id":"call-1"' // torn last line
    const events = parseLedgerLines(lines)
    expect(events).toHaveLength(1)
    const again = setup({ events })
    expect(again.ledger.spentTodayMicros()).toBe(4_000)
  })

  it('rejects non-integer money', () => {
    const { ledger } = setup()
    expect(() => ledger.reserve({ ...call, worstCaseMicros: 1.5 })).toThrow(/whole/)
  })

  it('summarizes today by call for the activity receipt', () => {
    const { ledger } = setup()
    const a = ledger.reserve({ ...call, worstCaseMicros: 3_000 })
    if (!a.ok) throw new Error('refused')
    ledger.settle(a.id, 900, { input: 800, output: 40, thoughts: 0 })
    ledger.reserve({ ...call, worstCaseMicros: 99_999 })
    expect(ledger.today()).toEqual([
      expect.objectContaining({ id: 'call-1', status: 'settled', micros: 900, usage: { input: 800, output: 40, thoughts: 0 } }),
      expect.objectContaining({ id: 'call-2', status: 'refused', micros: 0, reason: 'call-cap' }),
    ])
  })
})

describe('usdToMicros', () => {
  it('parses cap settings with string math', () => {
    expect(usdToMicros('10.00')).toBe(10_000_000)
    expect(usdToMicros('0.05')).toBe(50_000)
    expect(usdToMicros('2')).toBe(2_000_000)
    expect(usdToMicros('0.000001')).toBe(1)
  })
  it('rejects anything that is not a plain non-negative amount', () => {
    for (const bad of ['', '-1', 'ten', '1e3', '0.0000001', undefined]) expect(usdToMicros(bad)).toBeNull()
  })
})
