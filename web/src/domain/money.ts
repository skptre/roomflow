/**
 * Purchase math. Money is integer minor units plus an ISO currency code.
 * Unknown prices stay unknown, currencies are never mixed, owned items add no
 * new cost, and the result is a product subtotal (no tax or shipping).
 */
import type { Money } from './schema'

export type { Money } from './schema'

/** One thing the user would buy (or already owns) with its chosen offer's unit price. */
export type PurchaseLine = {
  id: string
  /** null = price unknown. Never read as zero. */
  unitPrice: Money | null
  quantity: number
  /** Already owned: shown, but adds no new-purchase cost. */
  owned: boolean
}

export type SubtotalStatus = 'complete' | 'incomplete' | 'mixed-currency'

export type Subtotal = {
  status: SubtotalStatus
  /** The single-currency total of known prices; null when nothing is priced or currencies are mixed. */
  total: Money | null
  /** Known totals per currency, sorted by currency code. */
  totals: Money[]
  /** Purchase lines (not owned, quantity > 0) whose price is unknown. */
  unpricedCount: number
  /** Purchase lines counted (not owned, quantity > 0). */
  lineCount: number
}

export type BudgetStatus = 'under' | 'over' | 'unknown' | 'no-budget'

function assertMoney(money: Money): void {
  if (!Number.isSafeInteger(money.amountMinor) || money.amountMinor < 0) {
    throw new RangeError(`price must be a non-negative integer of minor units, got ${money.amountMinor}`)
  }
  if (!/^[A-Z]{3}$/.test(money.currency)) throw new RangeError(`invalid currency ${money.currency}`)
}

export function subtotal(lines: readonly PurchaseLine[]): Subtotal {
  const byCurrency = new Map<string, number>()
  let unpricedCount = 0
  let lineCount = 0

  for (const line of lines) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 0) {
      throw new RangeError(`quantity must be a non-negative integer, got ${line.quantity}`)
    }
    if (line.unitPrice) assertMoney(line.unitPrice)
    if (line.owned || line.quantity === 0) continue

    lineCount += 1
    if (!line.unitPrice) {
      unpricedCount += 1
      continue
    }
    const sum = (byCurrency.get(line.unitPrice.currency) ?? 0) + line.unitPrice.amountMinor * line.quantity
    if (!Number.isSafeInteger(sum)) throw new RangeError('subtotal exceeds safe integer range')
    byCurrency.set(line.unitPrice.currency, sum)
  }

  const totals = [...byCurrency.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amountMinor]) => ({ amountMinor, currency }))

  const status: SubtotalStatus = totals.length > 1 ? 'mixed-currency' : unpricedCount > 0 ? 'incomplete' : 'complete'
  return { status, total: totals.length === 1 ? totals[0]! : null, totals, unpricedCount, lineCount }
}

/**
 * Whether the subtotal fits the budget. Only claims "under" when every counted
 * price is known and in the budget's currency; unknown prices can still prove
 * "over" because prices are never negative.
 */
export function budgetStatus(sub: Subtotal, budget: Money | null): BudgetStatus {
  if (!budget) return 'no-budget'
  assertMoney(budget)
  if (sub.status === 'mixed-currency') return 'unknown'
  if (sub.total && sub.total.currency !== budget.currency) return 'unknown'
  const known = sub.total?.amountMinor ?? 0
  if (known > budget.amountMinor) return 'over'
  return sub.status === 'complete' ? 'under' : 'unknown'
}

const formatters = new Map<string, Intl.NumberFormat>()

function formatterFor(currency: string, locale: string): Intl.NumberFormat {
  const key = `${locale}|${currency}`
  let formatter = formatters.get(key)
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, { style: 'currency', currency })
    formatters.set(key, formatter)
  }
  return formatter
}

/** Display money using the currency's own minor-unit precision (e.g. 2 for USD, 0 for JPY). */
export function formatMoney(money: Money, locale = 'en-US'): string {
  assertMoney(money)
  const formatter = formatterFor(money.currency, locale)
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2
  return formatter.format(money.amountMinor / 10 ** digits)
}
