/**
 * Design state: the committed room (authoritative, saved, priced), an optional
 * transient preview, selection, and undo history. Framework-free (zustand
 * vanilla) so it is testable without React; components subscribe with
 * `useStore(designStore, selector)`.
 *
 * Invariants:
 * - Previews never change `committed`. Only apply/commitPreview/undo/redo/setBudget/loadRoom do.
 * - Purchases are derived from committed objects (purchaseLines), so room and cart cannot drift,
 *   and undoing a room edit also undoes its cost.
 * - Every committed change bumps `revision`; work tagged with an older baseRevision is rejected.
 */
import { createStore, type StoreApi } from 'zustand/vanilla'
import { applyCommands, type Actor, type Command } from './commands'
import type { PurchaseLine } from './money'
import { Money, type FoundItem, type Offer, type Room } from './schema'

export const HISTORY_LIMIT = 100

export type Committed = { revision: number; room: Room; budget: Money | null }
type Snapshot = { room: Room; budget: Money | null }

export type Preview = {
  baseRevision: number
  room: Room
  commands: Command[]
  actor: Actor
  warnings: string[]
}

/**
 * Direct user edits apply to the current room. Automated edits (themes, AI,
 * background jobs) must say which revision they were computed from.
 */
export type ApplyOptions = { actor: 'user'; baseRevision?: number } | { actor: 'auto'; baseRevision: number }

export type ApplyResult =
  | { ok: true; revision: number; warnings: string[] }
  | { ok: false; error: string; stale?: boolean }

export type DesignState = {
  committed: Committed | null
  preview: Preview | null
  selectedId: string | null
  hoveredId: string | null
  past: Snapshot[]
  future: Snapshot[]

  loadRoom: (room: Room, budget?: Money | null) => void
  apply: (commands: Command[], options: ApplyOptions) => ApplyResult
  setBudget: (budget: Money | null) => ApplyResult
  startPreview: (commands: Command[], options?: ApplyOptions) => ApplyResult
  cancelPreview: () => void
  commitPreview: () => ApplyResult
  undo: () => boolean
  redo: () => boolean
  select: (id: string | null) => void
  hover: (id: string | null) => void
}

export type DesignStore = StoreApi<DesignState>

/** What the scene shows: the preview if one is active, otherwise the committed room. */
export function viewRoom(state: Pick<DesignState, 'committed' | 'preview'>): Room | null {
  return state.preview?.room ?? state.committed?.room ?? null
}

export type PurchaseSources = {
  offers: ReadonlyMap<string, Offer>
  foundItems?: ReadonlyMap<string, FoundItem>
}

/**
 * Purchase lines derived from a room's objects. Captured and owned furniture
 * add no new cost; a product whose offer is missing is unpriced, never free.
 */
export function purchaseLines(room: Room, sources: PurchaseSources): PurchaseLine[] {
  return room.objects.map((object) => {
    switch (object.sourceKind) {
      case 'captured':
      case 'owned':
        return { id: object.id, unitPrice: null, quantity: object.quantity, owned: true }
      case 'product': {
        const offer = object.offerId ? sources.offers.get(object.offerId) : undefined
        // An offer for a different variant says nothing about this item's price.
        const price = offer && offer.variantId === object.variantId ? offer.price : null
        return { id: object.id, unitPrice: price, quantity: object.quantity, owned: false }
      }
      case 'found': {
        const item = object.foundItemId ? sources.foundItems?.get(object.foundItemId) : undefined
        return { id: object.id, unitPrice: item?.price ?? null, quantity: object.quantity, owned: item?.owned ?? false }
      }
    }
  })
}

function existing(room: Room | null, id: string | null): string | null {
  return id !== null && room?.objects.some((object) => object.id === id) ? id : null
}

export function createDesignStore(): DesignStore {
  return createStore<DesignState>()((set, get) => {
    /** Replace the committed state with a new version, recording history. */
    function commit(next: Snapshot, history: { past: Snapshot[]; future: Snapshot[] }): number {
      const { committed, selectedId, hoveredId } = get()
      const revision = (committed?.revision ?? 0) + 1
      set({
        committed: { revision, room: next.room, budget: next.budget },
        preview: null,
        past: history.past.slice(-HISTORY_LIMIT),
        future: history.future,
        selectedId: existing(next.room, selectedId),
        hoveredId: existing(next.room, hoveredId),
      })
      return revision
    }

    function snapshot(committed: Committed): Snapshot {
      return { room: committed.room, budget: committed.budget }
    }

    function staleCheck(actor: Actor, baseRevision: number | undefined): ApplyResult | null {
      const { committed } = get()
      if (!committed) return { ok: false, error: 'No room is open.' }
      if (actor === 'auto' && baseRevision === undefined) {
        return { ok: false, error: 'Automated changes must name the room revision they were made for.' }
      }
      if (baseRevision !== undefined && baseRevision !== committed.revision) {
        return { ok: false, error: 'The room changed since this was prepared.', stale: true }
      }
      return null
    }

    return {
      committed: null,
      preview: null,
      selectedId: null,
      hoveredId: null,
      past: [],
      future: [],

      loadRoom(room, budget = null) {
        const revision = (get().committed?.revision ?? 0) + 1
        set({
          committed: { revision, room, budget },
          preview: null,
          past: [],
          future: [],
          selectedId: null,
          hoveredId: null,
        })
      },

      apply(commands, { actor, baseRevision }) {
        const rejected = staleCheck(actor, baseRevision)
        if (rejected) return rejected
        const committed = get().committed!
        const result = applyCommands(committed.room, commands, actor)
        if (!result.ok) return { ok: false, error: result.error }
        const revision = commit(
          { room: result.room, budget: committed.budget },
          { past: [...get().past, snapshot(committed)], future: [] },
        )
        return { ok: true, revision, warnings: result.warnings }
      },

      setBudget(budget) {
        const rejected = staleCheck('user', undefined)
        if (rejected) return rejected
        if (budget !== null && !Money.safeParse(budget).success) return { ok: false, error: 'Invalid budget.' }
        const committed = get().committed!
        const revision = commit(
          { room: committed.room, budget },
          { past: [...get().past, snapshot(committed)], future: [] },
        )
        return { ok: true, revision, warnings: [] }
      },

      startPreview(commands, options = { actor: 'user' }) {
        const { actor, baseRevision } = options
        const rejected = staleCheck(actor, baseRevision)
        if (rejected) return rejected
        const committed = get().committed!
        const result = applyCommands(committed.room, commands, actor)
        if (!result.ok) return { ok: false, error: result.error }
        set({
          preview: { baseRevision: committed.revision, room: result.room, commands, actor, warnings: result.warnings },
        })
        return { ok: true, revision: committed.revision, warnings: result.warnings }
      },

      cancelPreview() {
        const { preview, committed, selectedId, hoveredId } = get()
        if (!preview) return
        // Objects that only existed in the preview can no longer be selected or hovered.
        const room = committed?.room ?? null
        set({ preview: null, selectedId: existing(room, selectedId), hoveredId: existing(room, hoveredId) })
      },

      commitPreview() {
        const { preview } = get()
        if (!preview) return { ok: false, error: 'Nothing to apply.' }
        return get().apply(preview.commands, { actor: preview.actor, baseRevision: preview.baseRevision })
      },

      undo() {
        const { committed, past, future } = get()
        const previous = past[past.length - 1]
        if (!committed || !previous) return false
        commit(previous, { past: past.slice(0, -1), future: [snapshot(committed), ...future] })
        return true
      },

      redo() {
        const { committed, past, future } = get()
        const next = future[0]
        if (!committed || !next) return false
        commit(next, { past: [...past, snapshot(committed)], future: future.slice(1) })
        return true
      },

      select(id) {
        set({ selectedId: existing(viewRoom(get()), id) })
      },

      hover(id) {
        set({ hoveredId: existing(viewRoom(get()), id) })
      },
    }
  })
}

/** The app's single design store. */
export const designStore = createDesignStore()
