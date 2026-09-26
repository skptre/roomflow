import { describe, expect, it } from 'vitest'
import { moneyFromCents, moneyFromDecimalString } from './money'

describe('moneyFromDecimalString', () => {
  it('reads Shopify decimal strings as integer cents without float math', () => {
    expect(moneyFromDecimalString('4497.00', 'USD')).toEqual({ amountMinor: 449700, currency: 'USD' })
    expect(moneyFromDecimalString('15', 'USD')).toEqual({ amountMinor: 1500, currency: 'USD' })
    expect(moneyFromDecimalString('0.5', 'USD')).toEqual({ amountMinor: 50, currency: 'USD' })
    // 1.15 * 100 === 114.99999999999999 in floating point; string math must not drift.
    expect(moneyFromDecimalString('1.15', 'USD')).toEqual({ amountMinor: 115, currency: 'USD' })
  })

  it('strips thousands separators and surrounding space', () => {
    expect(moneyFromDecimalString(' 1,299.00 ', 'USD')).toEqual({ amountMinor: 129900, currency: 'USD' })
  })

  it('returns null (unknown), never zero, for anything unparseable', () => {
    for (const bad of ['', '-5.00', 'NaN', 'abc', '12.345', '1.2.3', '$10', '1e3', ',', '12,34.00']) {
      expect(moneyFromDecimalString(bad, 'USD'), bad).toBeNull()
    }
  })

  it('keeps a real zero price as zero', () => {
    expect(moneyFromDecimalString('0.00', 'USD')).toEqual({ amountMinor: 0, currency: 'USD' })
  })

  it('rejects an invalid currency code', () => {
    expect(moneyFromDecimalString('10.00', 'usd')).toBeNull()
  })
})

describe('moneyFromCents', () => {
  it('passes integer cents through', () => {
    expect(moneyFromCents(449700, 'USD')).toEqual({ amountMinor: 449700, currency: 'USD' })
  })

  it('returns null for non-integer, negative, or non-number input', () => {
    for (const bad of [12.5, -1, Number.NaN, Number.POSITIVE_INFINITY, '100', null, undefined]) {
      expect(moneyFromCents(bad, 'USD'), String(bad)).toBeNull()
    }
  })
})
