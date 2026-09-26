import { describe, expect, it } from 'vitest'
import { budgetStatus, formatMoney, subtotal, type PurchaseLine } from './money'

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' })

function line(id: string, unitPrice: PurchaseLine['unitPrice'], quantity = 1, owned = false): PurchaseLine {
  return { id, unitPrice, quantity, owned }
}

describe('subtotal', () => {
  it('multiplies by quantity and sums in minor units', () => {
    const result = subtotal([line('a', usd(1000), 2), line('b', usd(599))])
    expect(result.status).toBe('complete')
    expect(result.total).toEqual(usd(2599))
    expect(result.unpricedCount).toBe(0)
  })

  it('excludes owned items from the new-purchase subtotal', () => {
    const result = subtotal([line('a', usd(1000)), line('bed', usd(50000), 1, true)])
    expect(result.total).toEqual(usd(1000))
    expect(result.lineCount).toBe(1)
  })

  it('never treats an unknown price as zero', () => {
    const result = subtotal([line('a', usd(1000)), line('b', null)])
    expect(result.status).toBe('incomplete')
    expect(result.unpricedCount).toBe(1)
    expect(result.total).toEqual(usd(1000))
  })

  it('does not sum across currencies', () => {
    const result = subtotal([line('a', usd(1000)), line('b', { amountMinor: 900, currency: 'EUR' })])
    expect(result.status).toBe('mixed-currency')
    expect(result.total).toBeNull()
    expect(result.totals).toEqual([{ amountMinor: 900, currency: 'EUR' }, usd(1000)])
  })

  it('rejects non-integer money and quantities', () => {
    expect(() => subtotal([line('a', usd(10.5))])).toThrow()
    expect(() => subtotal([line('a', usd(1000), 1.5)])).toThrow()
    expect(() => subtotal([line('a', usd(-1))])).toThrow()
  })

  it('ignores zero-quantity lines entirely, even unpriced ones', () => {
    const result = subtotal([line('a', usd(1000), 0), line('b', null, 0)])
    expect(result.status).toBe('complete')
    expect(result.lineCount).toBe(0)
    expect(result.total).toBeNull()
    expect(result.totals).toEqual([])
  })
})

describe('budgetStatus', () => {
  const budget = usd(60000)

  it('reports under and over for complete subtotals', () => {
    expect(budgetStatus(subtotal([line('a', usd(59999))]), budget)).toBe('under')
    expect(budgetStatus(subtotal([line('a', usd(60000))]), budget)).toBe('under')
    expect(budgetStatus(subtotal([line('a', usd(60001))]), budget)).toBe('over')
  })

  it('is unknown when any price is unknown, even if the known part is under budget', () => {
    expect(budgetStatus(subtotal([line('a', usd(100)), line('b', null)]), budget)).toBe('unknown')
  })

  it('is over when the known part alone already exceeds the budget', () => {
    expect(budgetStatus(subtotal([line('a', usd(70000)), line('b', null)]), budget)).toBe('over')
  })

  it('is unknown for mixed currencies or a budget in another currency', () => {
    expect(budgetStatus(subtotal([line('a', usd(1)), line('b', { amountMinor: 1, currency: 'EUR' })]), budget)).toBe(
      'unknown',
    )
    expect(budgetStatus(subtotal([line('a', { amountMinor: 1, currency: 'EUR' })]), budget)).toBe('unknown')
  })

  it('is no-budget without a budget', () => {
    expect(budgetStatus(subtotal([line('a', usd(1))]), null)).toBe('no-budget')
  })

  it('is under for an empty purchase list', () => {
    expect(budgetStatus(subtotal([]), budget)).toBe('under')
  })
})

describe('formatMoney', () => {
  it('formats minor units with the currency', () => {
    expect(formatMoney(usd(2599))).toBe('$25.99')
    expect(formatMoney({ amountMinor: 1500, currency: 'JPY' })).toBe('¥1,500')
  })
})
