/**
 * "Design with Gemini" actions. The dialog sends a consented, text-only request,
 * turns the validated intent into a local proposal, previews it (automated,
 * revision-bound), and applies it as one undoable step. It owns only the exact
 * preview object it started: it never cancels or commits another tool's preview,
 * and a proposal built before a newer edit is refused, never applied over it.
 */
import type { CatalogEntry } from '../domain/catalog'
import { designStore, type ApplyResult, type Preview } from '../domain/designStore'
import { formatMoney } from '../domain/money'
import { formatSubtotal, purchaseSummary, type PurchaseRow, type PurchaseSummary, type SummarySources } from '../domain/purchases'
import type { Money, Room } from '../domain/schema'
import {
  describeRoomDesignIntent,
  parseRoomDesignResponse,
  RoomDesignRequest,
  type RoomDesignDescription,
  type RoomDesignIntent,
} from '../roomDesigner/contract'
import { buildRoomDesignProposal, type RoomDesignProposal } from '../roomDesigner/proposal'
import { cancelCatalogPreview } from './catalogActions'

const STALE_TEXT = 'Your room changed since this design was prepared. Ask again to design from your current room.'
const UNCHANGED = 'Your room is unchanged.'

/** The designer's own live preview; null when it has none (or it was replaced/committed elsewhere). */
let owned: Preview | null = null

/** The exact preview object the designer started, while it is still the store's active preview. */
export function ownedRoomDesignerPreview(): Preview | null {
  if (owned && designStore.getState().preview !== owned) owned = null
  return owned
}

/**
 * Shows the proposal in the room without touching the committed design. Drops the
 * designer's previous preview and any catalog hover preview first. Stale or empty
 * proposals are refused.
 */
export function beginRoomDesignerPreview(proposal: RoomDesignProposal): ApplyResult {
  cancelRoomDesignerPreview()
  cancelCatalogPreview()
  if (proposal.commands.length === 0) return { ok: false, error: 'This design has no changes to try in your room.' }
  const result = designStore.getState().startPreview(proposal.commands, { actor: 'auto', baseRevision: proposal.baseRevision })
  if (!result.ok) return result.stale ? { ...result, error: STALE_TEXT } : result
  owned = designStore.getState().preview
  return result
}

/** Cancels the designer's preview only when it is still the one shown. Returns whether it cancelled anything. */
export function cancelRoomDesignerPreview(): boolean {
  const live = ownedRoomDesignerPreview()
  owned = null
  if (!live) return false
  designStore.getState().cancelPreview()
  return true
}

/**
 * Commits the previewed proposal as one revision (room and purchases together;
 * one undo reverses both). Refused when the room changed since the proposal's
 * base revision (the designer's preview is then cancelled) or when the designer
 * no longer has a live preview of it.
 */
export function applyRoomDesignerPreview(proposal: RoomDesignProposal): ApplyResult {
  const committed = designStore.getState().committed
  if (!committed) return { ok: false, error: 'Open a room first.' }
  if (committed.revision !== proposal.baseRevision) {
    cancelRoomDesignerPreview()
    return { ok: false, error: STALE_TEXT, stale: true }
  }
  const live = ownedRoomDesignerPreview()
  if (!live || live.baseRevision !== proposal.baseRevision) return { ok: false, error: 'Preview this design in your room before applying it.' }
  const result = designStore.getState().apply(proposal.commands, { actor: 'auto', baseRevision: proposal.baseRevision })
  if (!result.ok) {
    cancelRoomDesignerPreview()
    return result.stale ? { ...result, error: STALE_TEXT } : result
  }
  owned = null
  return result
}

/** Purchase differences a proposal would make, with honest total and budget wording. */
export type DesignerCostReport = {
  /** Lines to buy that the committed room does not already have (by object and offer). */
  added: PurchaseRow[]
  /** Committed purchase lines the proposal drops (removed or replaced). */
  removed: PurchaseRow[]
  /** Purchase lines in the proposed room whose price is unknown. */
  unknownPrices: number
  /** Proposed product subtotal; "Price unknown" rather than $0 when nothing is priced. */
  totalText: string
  budgetText: string
}

const rowKey = (row: PurchaseRow) => `${row.id}|${row.offerId ?? ''}`

/** Compares committed and proposed purchases. Never sums across currencies; any unknown price makes the budget unknown. */
export function designerCostReport(before: PurchaseSummary, after: PurchaseSummary, budget: Money | null): DesignerCostReport {
  const beforeKeys = new Set(before.lines.map(rowKey))
  const afterKeys = new Set(after.lines.map(rowKey))
  const sub = after.subtotal
  let budgetText: string
  if (sub.status === 'mixed-currency') budgetText = 'Budget unknown: prices are in more than one currency.'
  else if (sub.status === 'incomplete') budgetText = `Budget unknown: ${sub.unpricedCount} ${sub.unpricedCount === 1 ? 'price is' : 'prices are'} unknown.`
  else if (!budget) budgetText = 'No budget set.'
  else if (sub.total && sub.total.currency !== budget.currency) budgetText = `Budget unknown: prices are not in ${budget.currency}.`
  else budgetText = `${(sub.total?.amountMinor ?? 0) > budget.amountMinor ? 'Over' : 'Within'} your ${formatMoney(budget)} budget.`
  return {
    added: after.lines.filter((row) => !beforeKeys.has(rowKey(row))),
    removed: before.lines.filter((row) => !afterKeys.has(rowKey(row))),
    unknownPrices: sub.unpricedCount,
    totalText: formatSubtotal(sub, budget?.currency),
    budgetText,
  }
}

export type PreparedRoomDesign = { proposal: RoomDesignProposal; description: RoomDesignDescription; cost: DesignerCostReport }

/**
 * Resolves a validated intent against the room it was requested for. Throws if the
 * intent does not validate against that room. The cost report compares against the
 * same room and sources, so preview money never touches committed state.
 */
export function prepareRoomDesign(
  intent: RoomDesignIntent,
  context: { room: Room; catalog: readonly CatalogEntry[]; budget: Money | null; baseRevision: number; sources: SummarySources },
): PreparedRoomDesign {
  const { room, catalog, budget, baseRevision, sources } = context
  const proposal = buildRoomDesignProposal({ intent, room, catalog, budget, baseRevision })
  const description = describeRoomDesignIntent(intent, room)
  const cost = designerCostReport(purchaseSummary(room, sources, budget), proposal.summary, budget)
  return { proposal, description, cost }
}

export type RoomDesignRequestResult = { ok: true; intent: RoomDesignIntent } | { ok: false; error: string }

/**
 * Sends one consented text-only request to the local endpoint (no retries) and
 * validates the returned intent against `room`. Server errors are fixed strings;
 * every failure says the room is unchanged. Aborts surface as an error the caller
 * may ignore.
 */
export async function requestRoomDesign(
  request: RoomDesignRequest,
  room: Pick<Room, 'objects'>,
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<RoomDesignRequestResult> {
  const parsed = RoomDesignRequest.safeParse(request)
  if (!parsed.success) {
    // A room-summary problem is not the user's wording; don't ask them to rewrite the brief.
    if (parsed.error.issues.some((issue) => issue.path[0] === 'roomSummary')) return { ok: false, error: `This room can’t be sent for design ideas. ${UNCHANGED}` }
    return { ok: false, error: 'Describe the room you want (up to 600 characters) and agree to send it.' }
  }
  const fetchImpl = options.fetchImpl ?? fetch
  let response: Response
  try {
    response = await fetchImpl('/api/design-room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
      signal: options.signal,
    })
  } catch {
    return { ok: false, error: `We couldn’t reach the room designer. Check your connection and try again. ${UNCHANGED}` }
  }
  let body: unknown
  try { body = await response.json() } catch { body = null }
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : 'The room designer is unavailable right now.'
    return { ok: false, error: `${message} ${UNCHANGED}` }
  }
  try {
    return { ok: true, intent: parseRoomDesignResponse(body, room).intent }
  } catch {
    return { ok: false, error: `Room design returned an invalid plan. Try again. ${UNCHANGED}` }
  }
}

export type BudgetInput = { ok: true; budget: Money | null } | { ok: false; error: string }

function fractionDigits(currency: string): number {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
}

/**
 * Parses a budget typed in major units ("1,200.50") into integer minor units in the
 * given ISO currency, using string arithmetic (no floating point). Empty means no budget.
 */
export function parseBudgetInput(text: string, currency: string): BudgetInput {
  const trimmed = text.trim().replaceAll(',', '')
  if (!trimmed) return { ok: true, budget: null }
  if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, error: 'Choose a currency for your budget.' }
  let digits: number
  try { digits = fractionDigits(currency) } catch { return { ok: false, error: 'Choose a supported currency for your budget.' } }
  const match = /^(\d{1,9})(?:\.(\d+))?$/.exec(trimmed)
  if (!match || (match[2] ?? '').length > digits) {
    return { ok: false, error: digits === 0 ? `Enter a whole ${currency} amount.` : `Enter an amount like 1500 or 1500.${'0'.repeat(digits)}.` }
  }
  const amountMinor = Number(match[1]) * 10 ** digits + Number((match[2] ?? '').padEnd(digits, '0') || '0')
  return { ok: true, budget: { amountMinor, currency } }
}
