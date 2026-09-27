import { describe, expect, it } from 'vitest'
import { costMicros, RATE_CARD, rateFor } from './rates'

describe('rate card', () => {
  it('records where and when the prices were read', () => {
    expect(RATE_CARD.version).toBe('2026-09-26')
    expect(RATE_CARD.source).toMatch(/^https:\/\/ai\.google\.dev\//)
  })

  it('prices gemini-3.8-flash at $0.75 in / $3.75 out per million tokens through 2026', () => {
    const rate = rateFor('gemini-3.8-flash', new Date('2026-09-26T12:00:00Z'))!
    expect(rate).toEqual({ inputNanosPerToken: 750, outputNanosPerToken: 3750 })
  })

  it('knows no price for gemini-3.8-flash from 2027 on (the listed rate changes; refuse rather than guess)', () => {
    expect(rateFor('gemini-3.8-flash', new Date('2027-01-01T00:00:00Z'))).toBeUndefined()
  })

  it('knows no price for a model not on the card', () => {
    expect(rateFor('gemini-9-ultra', new Date('2026-09-26T12:00:00Z'))).toBeUndefined()
  })

  it('bills thinking tokens as output and rounds up to whole micro-dollars', () => {
    const rate = { inputNanosPerToken: 750, outputNanosPerToken: 3750 }
    // 1000 in × 750 n$ + (200 out + 300 thinking) × 3750 n$ = 750,000 + 1,875,000 n$ = 2,625 µ$
    expect(costMicros(rate, { input: 1000, output: 200, thoughts: 300 })).toBe(2625)
    expect(costMicros(rate, { input: 1, output: 0, thoughts: 0 })).toBe(1)
    expect(costMicros(rate, { input: 0, output: 0, thoughts: 0 })).toBe(0)
  })
})
