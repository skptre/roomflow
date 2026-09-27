/**
 * Looks ("Try a look"): a theme restyles the room's finishes and proposes a
 * coordinated set of products for it. Proposals are deterministic data —
 * commands plus notes — built by code from ranked catalog candidates. Later an
 * AI can choose or rank the candidates, but it never writes the commands:
 * this module still builds and validates them.
 *
 * Rules: kept items are never replaced or removed, locked items never move,
 * the result stays within the budget or says why not, and with a budget set
 * only priced items are chosen so the budget remains checkable.
 */
import { filterHard, rankSoft, type CatalogEntry } from './catalog'
import { CATEGORIES, alternativeCategories } from './categories'
import { applyCommands, type Command } from './commands'
import { purchaseLine } from './designStore'
import { aboveSpot, anchorObject, besideSpot, cornerSpot, rugSpot, wallSpot, windowSpot } from './layout'
import { formatMoney, subtotal } from './money'
import { purchaseSummary, type PurchaseSummary, type SummarySources } from './purchases'
import type { Finishes, Money, Offer, Room, RoomObject } from './schema'

export type Theme = {
  id: string
  name: string
  description: string
  finishes: Finishes
  /** Catalog tags this look prefers (soft ranking, never a filter). */
  tags: string[]
}

/** Placeholder looks; names and palettes are not final (aesthetic TBD). */
export const THEMES: Theme[] = [
  {
    id: 'warm-natural',
    name: 'Warm natural',
    description: 'Oak, linen, clay and plants.',
    finishes: { wall: '#f1e8dc', floor: '#c49a6c', accent: '#c27b58' },
    tags: ['warm', 'natural', 'oak', 'linen', 'ceramic', 'cozy'],
  },
  {
    id: 'clean-minimal',
    name: 'Clean minimal',
    description: 'Light, quiet, fewer lines.',
    finishes: { wall: '#f4f4f1', floor: '#d8cfc2', accent: '#5b5d63' },
    tags: ['minimal', 'metal'],
  },
  {
    id: 'colorful',
    name: 'Colorful',
    description: 'Bold color, playful pieces.',
    finishes: { wall: '#f3e6d8', floor: '#b98a5e', accent: '#3e7c8c' },
    tags: ['colorful', 'cozy'],
  },
]

export type Proposal = {
  themeId: string
  /** Committed revision this was built from; applying it later than that is rejected. */
  baseRevision: number
  commands: Command[]
  /** One line per change, e.g. "Swapped Chair for Mono Chair · −$20.00". */
  notes: string[]
  /** Why something the look wanted was left out (budget, space). Empty when nothing was skipped. */
  conflicts: string[]
}

/** Categories every look tries to include if the room has none, in priority order (curtains only where there's a window). */
const ESSENTIALS = ['floor-lamp', 'rug', 'plant', 'wall-art', 'curtain'] as const

function signed(amountMinor: number, currency: string): string {
  if (amountMinor === 0) return `±${formatMoney({ amountMinor: 0, currency })}`
  return `${amountMinor > 0 ? '+' : '−'}${formatMoney({ amountMinor: Math.abs(amountMinor), currency })}`
}

function label(category: string): string {
  return (CATEGORIES[category]?.label ?? category).toLowerCase()
}

type Budget = {
  /** null: no budget, or the room's cost can't be verified; nothing is pruned by price. */
  remaining: Money | null
  enforce: boolean
}

export function buildProposal(
  room: Room,
  theme: Theme,
  catalog: readonly CatalogEntry[],
  budget: Money | null,
  baseRevision: number,
): Proposal {
  const commands: Command[] = [{ type: 'restyle', finishes: theme.finishes }]
  const notes: string[] = [`Walls and floor in ${theme.name.toLowerCase()} tones`]
  const conflicts: string[] = []
  const offers = new Map<string, Offer>(catalog.map((entry) => [entry.offer.id, entry.offer]))
  let working: Room = { ...room, finishes: theme.finishes }

  // What is already being bought, and what is left of the budget.
  const current = subtotal(working.objects.map((object) => purchaseLine(object, { offers })))
  const money: Budget = { remaining: null, enforce: budget !== null }
  if (budget) {
    if (current.status !== 'complete' || (current.total && current.total.currency !== budget.currency)) {
      conflicts.push("Some items in the room have no known price, so this look can't be checked against the budget.")
      money.enforce = false
    } else {
      const spent = current.total?.amountMinor ?? 0
      if (spent > budget.amountMinor) {
        conflicts.push(`The items you're keeping already cost more than the ${formatMoney(budget)} budget, so nothing new was added.`)
        return { themeId: theme.id, baseRevision, commands, notes, conflicts }
      }
      money.remaining = { amountMinor: budget.amountMinor - spent, currency: budget.currency }
    }
  }

  const ranked = (categories: string[]) =>
    rankSoft(filterHard(catalog, { category: categories }, working), { tags: theme.tags }).filter(
      // With a budget, only priced items in the budget's currency keep it checkable.
      (entry) => !money.enforce || (entry.offer.price !== null && entry.offer.price.currency === budget!.currency),
    )

  /** Try a change; accept it only if every command validates with no overlap warnings. */
  const tryCommands = (next: Command[]): Room | null => {
    const result = applyCommands(working, next, 'auto')
    return result.ok && result.warnings.length === 0 ? result.room : null
  }

  const affordable = (delta: number) => !money.enforce || !money.remaining || delta <= money.remaining.amountMinor
  const spend = (delta: number) => {
    if (money.remaining) money.remaining = { ...money.remaining, amountMinor: money.remaining.amountMinor - delta }
  }

  // 1. Replace items the user didn't ask to keep with the best-suited piece that fits the same spot.
  const replaceable = [...room.objects]
    .filter((object) => !object.keep && object.sourceKind !== 'found' && object.category !== 'curtain')
    .sort((a, b) => a.id.localeCompare(b.id))
  for (const object of replaceable) {
    const currentPrice = purchaseLine(object, { offers }).unitPrice?.amountMinor ?? 0
    for (const entry of ranked(alternativeCategories(object.category))) {
      if (entry.variant.id === object.variantId) break // already the best match
      const price = (entry.offer.price?.amountMinor ?? 0) * object.quantity
      const delta = price - currentPrice * object.quantity
      if (!affordable(delta)) continue
      const { id: _id, pose: _pose, ...replacement } = {
        ...object,
        name: entry.product.name,
        category: entry.product.category,
        sourceKind: 'product' as const,
        dimensions: entry.variant.dimensions,
        asset: entry.variant.asset,
        fidelity: 'approximate' as const,
        variantId: entry.variant.id,
        offerId: entry.offer.id,
        foundItemId: undefined,
      }
      const command: Command = { type: 'replace', id: object.id, with: replacement }
      const next = tryCommands([command])
      if (!next) continue
      working = next
      commands.push(command)
      spend(delta)
      notes.push(`Swapped ${object.name} for ${entry.product.name} · ${entry.offer.price ? signed(delta, entry.offer.price.currency) : 'price unknown'}`)
      break
    }
  }

  // 2. Add essentials the room lacks, placed by simple room-relative rules.
  const wallHeight = Math.min(...room.walls.map((wall) => wall.height), 2.6)
  for (const category of ESSENTIALS) {
    if (working.objects.some((object) => object.category === category)) continue
    if (category === 'curtain' && !working.openings.some((opening) => opening.kind === 'window')) continue
    const anchor = anchorObject(working)
    let added = false
    let blockedByBudget = false
    for (const entry of ranked([category])) {
      const price = entry.offer.price?.amountMinor ?? 0
      if (!affordable(price)) {
        blockedByBudget = true
        continue
      }
      const candidate: RoomObject = {
        id: `look-${theme.id}-${category}`,
        name: entry.product.name,
        category: entry.product.category,
        sourceKind: 'product',
        dimensions: entry.variant.dimensions,
        pose: { position: { x: 0, y: 0, z: 0 }, yaw: 0 },
        asset: entry.variant.asset,
        fidelity: 'approximate',
        variantId: entry.variant.id,
        offerId: entry.offer.id,
        quantity: 1,
        keep: false,
        lockPlacement: false,
      }
      const placed =
        category === 'rug'
          ? rugSpot(working, candidate, anchor)
          : category === 'floor-lamp'
            ? besideSpot(working, candidate, anchor)
            : category === 'plant'
              ? cornerSpot(working, candidate)
              : category === 'curtain'
                ? windowSpot(working, candidate)
                : (aboveSpot(working, candidate, anchor, wallHeight) ?? wallSpot(working, candidate, 1.2))
      if (!placed) continue
      const command: Command = { type: 'add', object: placed }
      const next = tryCommands([command])
      if (!next) continue
      working = next
      commands.push(command)
      spend(price)
      notes.push(`Added ${entry.product.name} · ${entry.offer.price ? signed(price, entry.offer.price.currency) : 'price unknown'}`)
      added = true
      break
    }
    if (!added) {
      conflicts.push(blockedByBudget ? `Left out a ${label(category)} to stay within the budget.` : `No good spot for a ${label(category)}.`)
    }
  }

  return { themeId: theme.id, baseRevision, commands, notes, conflicts }
}

export type ProposalOutcome = { ok: true; room: Room; summary: PurchaseSummary } | { ok: false; error: string }

/** What a proposal would produce — the room and its purchase summary — without changing anything. */
export function proposalOutcome(room: Room, proposal: Proposal, sources: SummarySources, budget: Money | null): ProposalOutcome {
  const result = applyCommands(room, proposal.commands, 'auto')
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, room: result.room, summary: purchaseSummary(result.room, sources, budget) }
}
