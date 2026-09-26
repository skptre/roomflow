/** What the committed room would cost to buy, line by line, with honest totals. */
import { purchaseLine, type PurchaseSources } from './designStore'
import { budgetStatus, formatMoney, subtotal, type BudgetStatus, type Subtotal } from './money'
import type { Money, Room } from './schema'

export type PurchaseRow = {
  id: string
  name: string
  variantLabel: string | null
  quantity: number
  /** null = unknown price (never zero). */
  unitPrice: Money | null
  lineTotal: Money | null
  isSample: boolean
}

export type PurchaseSummary = {
  lines: PurchaseRow[]
  /** Existing furniture shown in the room that adds no new cost. */
  ownedCount: number
  subtotal: Subtotal
  budget: BudgetStatus
  anySample: boolean
}

export type SummarySources = PurchaseSources & { variantLabels?: ReadonlyMap<string, string> }

export function purchaseSummary(room: Room, sources: SummarySources, budget: Money | null): PurchaseSummary {
  const lines = room.objects.map((object) => ({ object, line: purchaseLine(object, sources) }))
  const rows: PurchaseRow[] = lines
    .filter(({ line }) => !line.owned && line.quantity > 0)
    .map(({ object, line }) => {
      const offer = object.offerId ? sources.offers.get(object.offerId) : undefined
      return {
        id: object.id,
        name: object.name,
        variantLabel: object.variantId ? (sources.variantLabels?.get(object.variantId) ?? null) : null,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        lineTotal: line.unitPrice ? { amountMinor: line.unitPrice.amountMinor * line.quantity, currency: line.unitPrice.currency } : null,
        isSample: offer?.isSample ?? false,
      }
    })
  const sub = subtotal(lines.map(({ line }) => line))
  return {
    lines: rows,
    ownedCount: lines.filter(({ line }) => line.owned).length,
    subtotal: sub,
    budget: budgetStatus(sub, budget),
    anySample: rows.some((row) => row.isSample),
  }
}

/**
 * Budget left for new items, used to prune clearly unaffordable catalog items.
 * Unknown (null) without a budget, while any price is unknown, or across currencies.
 */
export function remainingBudget(summary: PurchaseSummary, budget: Money | null): Money | null {
  if (!budget || summary.subtotal.status !== 'complete') return null
  const spent = summary.subtotal.total
  if (spent && spent.currency !== budget.currency) return null
  return { amountMinor: Math.max(0, budget.amountMinor - (spent?.amountMinor ?? 0)), currency: budget.currency }
}

/**
 * Budget available for the next choice: for an addition, what is left after
 * everything already chosen; when replacing an item, that item's own cost is
 * given back first. Null when there is no budget or it can't be known.
 */
export function budgetForChoice(room: Room, sources: SummarySources, budget: Money | null, replacingId?: string): Money | null {
  const rest = replacingId ? { ...room, objects: room.objects.filter((object) => object.id !== replacingId) } : room
  return remainingBudget(purchaseSummary(rest, sources, budget), budget)
}

/** The subtotal as display text. An entirely unpriced subtotal is "Price unknown", never $0.00. */
export function formatSubtotal(sub: Subtotal, fallbackCurrency = 'USD'): string {
  if (sub.status === 'mixed-currency') return sub.totals.map((money) => formatMoney(money)).join(' + ')
  if (sub.total) return formatMoney(sub.total)
  return sub.unpricedCount > 0 ? 'Price unknown' : formatMoney({ amountMinor: 0, currency: fallbackCurrency })
}
