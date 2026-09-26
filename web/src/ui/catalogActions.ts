/**
 * Catalog → room actions. Hovering or focusing a card previews it in the room
 * without touching the committed design; leaving cancels; choosing commits the
 * same commands as one undoable step.
 */
import { placementCommands, type CatalogEntry, type PlacementTarget } from '../domain/catalog'
import type { Command } from '../domain/commands'
import { designStore } from '../domain/designStore'
import { noticeStore } from './noticeStore'

export type PreviewOutcome = { ok: true } | { ok: false; reason: 'no-space' | 'no-room' | 'refused'; message: string }

/** Which card currently owns the preview, so a late "leave" from another card can't cancel it. */
let previewOwner: string | null = null

type Built = { ok: true; commands: Command[] } | { ok: false; outcome: Extract<PreviewOutcome, { ok: false }> }

function commandsFor(entry: CatalogEntry, target: PlacementTarget, quantity: number): Built {
  const room = designStore.getState().committed?.room
  if (!room) return { ok: false, outcome: { ok: false, reason: 'no-room', message: 'Open a room first.' } }
  const commands = placementCommands(room, entry, target, quantity)
  if (!commands)
    return { ok: false, outcome: { ok: false, reason: 'no-space', message: 'No free space for this size.' } }
  return { ok: true, commands }
}

export function previewEntry(
  owner: string,
  entry: CatalogEntry,
  target: PlacementTarget,
  quantity: number,
): PreviewOutcome {
  const built = commandsFor(entry, target, quantity)
  if (!built.ok) {
    endPreview(previewOwner ?? owner)
    return built.outcome
  }
  const result = designStore.getState().startPreview(built.commands)
  if (!result.ok) {
    endPreview(previewOwner ?? owner)
    return { ok: false, reason: 'refused', message: result.error }
  }
  previewOwner = owner
  return { ok: true }
}

export function endPreview(owner: string) {
  if (previewOwner !== owner) return
  previewOwner = null
  designStore.getState().cancelPreview()
}

/** Commit the entry: reuse the live preview when it is this card's, otherwise apply fresh commands. */
export function placeEntry(owner: string, entry: CatalogEntry, target: PlacementTarget, quantity: number): boolean {
  const state = designStore.getState()
  let result
  let commands
  if (previewOwner === owner && state.preview) {
    commands = state.preview.commands
    result = state.commitPreview()
  } else {
    const built = commandsFor(entry, target, quantity)
    if (!built.ok) {
      noticeStore.getState().show(built.outcome.message, 'warning')
      return false
    }
    commands = built.commands
    result = state.apply(commands, { actor: 'user' })
  }
  previewOwner = null
  if (!result.ok) {
    noticeStore.getState().show(result.error, 'danger')
    return false
  }
  const added = commands.find((command) => command.type === 'add')
  if (added?.type === 'add') designStore.getState().select(added.object.id)
  noticeStore
    .getState()
    .show(target.mode === 'swap' ? `Swapped in ${entry.product.name}.` : `Added ${entry.product.name}.`)
  return true
}

/** Dismiss an explicit preview when leaving its browsing context. */
export function cancelCatalogPreview() {
  previewOwner = null
  designStore.getState().cancelPreview()
}

export function ownsPreview(owner: string): boolean {
  return previewOwner === owner
}
