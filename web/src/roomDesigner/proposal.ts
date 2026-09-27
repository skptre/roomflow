/** Deterministic resolution of bounded design intent into catalog-backed room edits. */
import { Product, Variant, Offer, type Money, type Room } from '../domain/schema'
import { placementCommands, type CatalogEntry } from '../domain/catalog'
import { applyCommands, checkPlacement, type Command } from '../domain/commands'
import { purchaseSummary, type PurchaseSummary } from '../domain/purchases'
import { blocksDoorway, freeSpot } from '../domain/layout'
import { footprintBounds } from '../domain/geometry'
import { normalizeYaw } from '../domain/units'
import { parseRoomDesignIntent, type RoomDesignIntent } from './contract'

/** All pricing, positions and commands are resolved locally at this committed revision. */
export type RoomDesignProposalInput = {
  intent: RoomDesignIntent
  catalog: readonly CatalogEntry[]
  room: Room
  budget: Money | null
  baseRevision: number
}

/** A proposal can be partial only when each omitted request has a visible reason. */
export type RoomDesignProposal = {
  baseRevision: number
  commands: Command[]
  notes: string[]
  warnings: string[]
  skipped: string[]
  summary: PurchaseSummary
}

function stableHash(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619)
  return hash >>> 0
}

function recolor(color: string, mode: 'darken' | 'lighten'): string {
  const channels = [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16))
  return `#${channels.map((value) => Math.round(mode === 'darken' ? value * 0.7 : value + (255 - value) * 0.3).toString(16).padStart(2, '0')).join('')}`
}

function validEntry(entry: CatalogEntry): boolean {
  return Product.safeParse(entry.product).success && Variant.safeParse(entry.variant).success && Offer.safeParse(entry.offer).success &&
    entry.variant.productId === entry.product.id && entry.offer.variantId === entry.variant.id
}

/** Builds a safe, possibly partial proposal. Every emitted command is checked against the latest working room with the automated actor. */
export function buildRoomDesignProposal(input: RoomDesignProposalInput): RoomDesignProposal {
  const { room, budget, baseRevision } = input
  const intent = parseRoomDesignIntent(input.intent, room)
  const catalog = input.catalog.filter(validEntry)
  // A sold-out offer still prices an already placed item; only new choices need confirmed stock.
  const offers = new Map(catalog.map((entry) => [entry.offer.id, entry.offer]))
  const selectable = catalog.filter((entry) => entry.offer.available === true)
  const commands: Command[] = []
  const notes: string[] = []
  const warnings: string[] = []
  const skipped: string[] = []
  let working = room
  const summary = (candidate: Room) => purchaseSummary(candidate, { offers }, budget)

  const attempt = (nextCommands: Command[]): { ok: true } | { ok: false; reason: string } => {
    const result = applyCommands(working, nextCommands, 'auto')
    if (!result.ok) return { ok: false, reason: result.error }
    if (result.warnings.length) return { ok: false, reason: result.warnings.join(' ') }
    const next = summary(result.room)
    if (budget && nextCommands.some((command) => command.type === 'add' || command.type === 'replace')) {
      if (next.subtotal.totals.some((total) => total.currency !== budget.currency)) {
        return { ok: false, reason: 'Skipped an item because its currency differs from the budget.' }
      }
      const known = next.subtotal.totals.find((total) => total.currency === budget.currency)?.amountMinor ?? 0
      if (known > budget.amountMinor) {
        return { ok: false, reason: 'Skipped an item to stay within the budget.' }
      }
    }
    working = result.room
    commands.push(...nextCommands)
    return { ok: true }
  }
  const tryCommand = (command: Command): boolean => {
    const result = attempt([command])
    if (!result.ok) { skipped.push(result.reason); return false }
    return true
  }

  if (intent.palette && intent.palette.mode !== 'preserve') {
    const color = intent.palette.mode === 'set' ? intent.palette.color : null
    const recolored = (original: string) => color ?? recolor(original, intent.palette!.mode as 'darken' | 'lighten')
    const finishes = { ...working.finishes, wall: recolored(working.finishes.wall), floor: recolored(working.finishes.floor), accent: recolored(working.finishes.accent ?? working.finishes.wall) }
    if (tryCommand({ type: 'restyle', finishes })) notes.push('Updated the room palette.')
  }

  for (const id of intent.removeObjectIds) {
    const object = working.objects.find((item) => item.id === id)!
    if (object.keep) { skipped.push(`Kept ${object.name} because it is marked to keep.`); continue }
    if (tryCommand({ type: 'remove', id })) notes.push(`Removed ${object.name}.`)
  }

  const choose = (category: string, count: number, target: { mode: 'swap'; objectId: string } | { mode: 'add' }): boolean => {
    const candidates = selectable.filter((entry) => entry.product.category === category)
      .sort((a, b) => (a.offer.price?.amountMinor ?? Number.MAX_SAFE_INTEGER) - (b.offer.price?.amountMinor ?? Number.MAX_SAFE_INTEGER) || a.variant.id.localeCompare(b.variant.id))
    if (!candidates.length) { skipped.push(`No in-stock catalog item is available for ${category}.`); return false }
    let reason = `No safe spot or fitting catalog item was found for ${category}.`
    for (const entry of candidates) {
      if (budget && !entry.offer.price) { reason = `No ${category} offer has a known price for this budget.`; continue }
      if (budget && entry.offer.price?.currency !== budget.currency) { reason = `No ${category} offer matches the budget currency.`; continue }
      const before = skipped.length
      const proposed = placementCommands(working, entry, target, count)
      if (!proposed) { reason = `No free space or safe spot is available for ${category}.`; continue }
      if (proposed.length !== 1) { reason = `Could not safely place ${category}.`; continue }
      if (tryCommand(proposed[0]!)) { notes.push(`${target.mode === 'swap' ? 'Replaced an item with' : 'Added'} ${entry.product.name}.`); return true }
      reason = skipped.pop() ?? reason
      skipped.length = before
    }
    skipped.push(reason)
    return false
  }

  for (const item of intent.replace) {
    const object = working.objects.find((candidate) => candidate.id === item.objectId)!
    if (object.keep) { skipped.push(`Kept ${object.name} because it is marked to keep.`); continue }
    if (choose(item.category, 1, { mode: 'swap', objectId: object.id })) {
      for (let i = 1; i < item.count; i++) choose(item.category, 1, { mode: 'add' })
    }
  }
  for (const item of intent.add) for (let i = 0; i < item.count; i++) choose(item.category, 1, { mode: 'add' })

  if (intent.rearrange !== 'none') {
    const bounds = footprintBounds(room.floorPolygon)
    const normalizedIntent = {
      palette: intent.palette,
      rearrange: intent.rearrange,
      removeObjectIds: [...intent.removeObjectIds].sort(),
      replace: [...intent.replace].sort((a, b) => a.objectId.localeCompare(b.objectId) || a.category.localeCompare(b.category)),
      add: [...intent.add].sort((a, b) => a.category.localeCompare(b.category) || a.count - b.count),
    }
    const seed = `${room.id}|${baseRevision}|${JSON.stringify(normalizedIntent)}`
    const movable = [...working.objects].filter((object) => !object.lockPlacement && Math.abs(object.pose.position.y) < 0.001)
      .sort((a, b) => stableHash(`${seed}|${a.id}`) - stableHash(`${seed}|${b.id}`) || a.id.localeCompare(b.id))
    const targets = [
      { x: bounds.minX + (bounds.maxX - bounds.minX) * 0.25, z: bounds.minZ + (bounds.maxZ - bounds.minZ) * 0.25 },
      { x: bounds.maxX - (bounds.maxX - bounds.minX) * 0.25, z: bounds.minZ + (bounds.maxZ - bounds.minZ) * 0.25 },
      { x: bounds.maxX - (bounds.maxX - bounds.minX) * 0.25, z: bounds.maxZ - (bounds.maxZ - bounds.minZ) * 0.25 },
      { x: bounds.minX + (bounds.maxX - bounds.minX) * 0.25, z: bounds.maxZ - (bounds.maxZ - bounds.minZ) * 0.25 },
    ]
    const selected = intent.rearrange === 'gentle' ? movable.slice(0, 1) : movable
    for (const object of selected) {
      const offset = stableHash(`${seed}|spot|${object.id}`) % targets.length
      let changed = false
      for (let i = 0; i < targets.length; i++) {
        const near = targets[(offset + i) % targets.length]!
        const pose = freeSpot(working, object.dimensions, { near, ignoreId: object.id, yaws: [object.pose.yaw, normalizeYaw(object.pose.yaw + Math.PI / 2)] })
        if (!pose) continue
        const position = { x: pose.position.x, z: pose.position.z }
        if (checkPlacement(working, object.id, position, pose.yaw).status !== 'ok') continue
        const finalObject = { ...object, pose: { position: { ...pose.position, y: object.pose.position.y }, yaw: pose.yaw } }
        if (blocksDoorway(working, finalObject)) continue
        const current = working.objects.find((item) => item.id === object.id)!
        const moved = position.x !== current.pose.position.x || position.z !== current.pose.position.z
        const rotated = pose.yaw !== current.pose.yaw
        if (!moved && !rotated) continue
        const move: Command = { type: 'move', id: object.id, position }
        const rotate: Command = { type: 'rotate', id: object.id, yaw: pose.yaw }
        const sequences = moved && rotated ? [[move, rotate], [rotate, move]] : [moved ? [move] : [rotate]]
        for (const sequence of sequences) {
          const trial = applyCommands(working, sequence, 'auto')
          if (!trial.ok || trial.warnings.length) continue
          const actual = trial.room.objects.find((item) => item.id === object.id)!
          if (actual.pose.position.x !== position.x || actual.pose.position.z !== position.z || actual.pose.yaw !== pose.yaw || blocksDoorway(trial.room, actual)) continue
          if (!attempt(sequence).ok) continue
          if (moved) notes.push(`Moved ${object.name}.`)
          if (rotated) notes.push(`Rotated ${object.name}.`)
          changed = true
          break
        }
        if (changed) break
      }
      if (!changed) skipped.push(`No safe rearrangement spot was found for ${object.name}.`)
    }
  }

  const finalSummary = summary(working)
  if (budget && finalSummary.budget === 'unknown') warnings.push('The budget status is unknown because one or more prices are unknown.')
  return { baseRevision, commands, notes, warnings, skipped, summary: finalSummary }
}
