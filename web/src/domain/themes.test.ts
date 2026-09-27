import { describe, expect, it } from 'vitest'
import { sampleCatalog, sampleOffers } from '../fixtures/sample-catalog'
import { lamp, sampleRoom } from '../test/rooms'
import { entryToObject } from './catalog'
import { applyCommands } from './commands'
import { createDesignStore, purchaseLines } from './designStore'
import { subtotal } from './money'
import { purchaseSummary } from './purchases'
import type { Room } from './schema'
import { buildProposal, proposalOutcome, THEMES } from './themes'

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' })
const sources = { offers: sampleOffers }
const [warm, minimal, colorful] = THEMES

function applied(room: Room, proposal: ReturnType<typeof buildProposal>): Room {
  const result = applyCommands(room, proposal.commands, 'auto')
  if (!result.ok) throw new Error(result.error)
  return result.room
}

/** The sample room plus a non-kept product that proposals may replace. */
function roomWithReplaceable(): Room {
  const room = sampleRoom()
  const chairEntry = sampleCatalog.find((e) => e.variant.id === 'v-pop-chair-std')!
  const extra = entryToObject(chairEntry, { id: 'extra-chair', position: { x: -1.5, z: -1.4 }, yaw: 0 })
  return { ...room, objects: [...room.objects, extra] }
}

describe('THEMES', () => {
  it('offers three distinct looks', () => {
    expect(THEMES.map((t) => t.id)).toEqual(['warm-natural', 'clean-minimal', 'colorful'])
    expect(new Set(THEMES.map((t) => t.finishes.wall)).size).toBe(3)
  })
})

describe('buildProposal', () => {
  it('restyles the finishes and adds essentials the room is missing', () => {
    const room = sampleRoom()
    const proposal = buildProposal(room, warm!, sampleCatalog, null, 7)
    expect(proposal.baseRevision).toBe(7)
    expect(proposal.commands[0]).toEqual({ type: 'restyle', finishes: warm!.finishes })
    const after = applied(room, proposal)
    const categories = after.objects.map((o) => o.category)
    for (const essential of ['floor-lamp', 'rug', 'plant', 'wall-art']) expect(categories).toContain(essential)
  })

  it('dresses a scanned window with a curtain, and adds none where there is no window', () => {
    const art = sampleCatalog.find((e) => e.product.category === 'wall-art')!
    const curtain = {
      ...art,
      product: { ...art.product, id: 'p-curtain', name: 'Linen Curtain', category: 'curtain' },
      variant: { ...art.variant, id: 'v-curtain', productId: 'p-curtain', dimensions: { width: 1.27, height: 2.13, depth: 0.05, source: 'merchant' as const } },
      offer: { ...art.offer, id: 'o-curtain', variantId: 'v-curtain' },
    }
    const catalog = [...sampleCatalog, curtain]
    const room = sampleRoom()
    const after = applied(room, buildProposal(room, warm!, catalog, null, 1))
    const hung = after.objects.find((o) => o.category === 'curtain')!
    const window = room.openings.find((o) => o.kind === 'window')!
    const wall = room.walls.find((w) => w.id === window.wallId)!
    // Centered on the window along its wall (the sample window is on a wall running along Z).
    expect(hung.pose.position.z).toBeCloseTo(wall.start.z + window.offsetAlongWall, 6)
    const windowless = { ...room, openings: room.openings.filter((o) => o.kind !== 'window') }
    expect(applied(windowless, buildProposal(windowless, warm!, catalog, null, 1)).objects.some((o) => o.category === 'curtain')).toBe(false)

    // A look leaves existing window dressing in place; swapping its size at the old pose can cut across the room.
    const ownedCurtain = { ...hung, id: 'owned-curtain', sourceKind: 'owned' as const, variantId: undefined, offerId: undefined }
    const furnished = { ...room, objects: [...room.objects, ownedCurtain] }
    const previewed = applied(furnished, buildProposal(furnished, warm!, catalog, null, 1))
    expect(previewed.objects.find((object) => object.id === ownedCurtain.id)).toEqual(ownedCurtain)
  })

  it('never moves locked items or removes kept ones (RF6)', () => {
    const base = roomWithReplaceable()
    const locked: Room = {
      ...base,
      objects: base.objects.map((o) => (o.id === 'OBJ-BED' ? { ...o, lockPlacement: true, keep: false } : o)),
    }
    for (const theme of THEMES) {
      const after = applied(locked, buildProposal(locked, theme, sampleCatalog, null, 1))
      const bed = after.objects.find((o) => o.id === 'OBJ-BED')!
      expect(bed.pose).toEqual(locked.objects.find((o) => o.id === 'OBJ-BED')!.pose)
      for (const kept of locked.objects.filter((o) => o.keep)) {
        const stillThere = after.objects.find((o) => o.id === kept.id)
        expect(stillThere).toBeDefined()
        expect(stillThere!.variantId).toBe(kept.variantId)
      }
    }
  })

  it('replaces non-kept items with a same-category piece that suits the theme', () => {
    const room = roomWithReplaceable()
    const after = applied(room, buildProposal(room, minimal!, sampleCatalog, null, 1))
    const chair = after.objects.find((o) => o.id === 'extra-chair')!
    expect(chair.category).toBe('desk-chair')
    expect(chair.variantId).toBe('v-mono-chair-std')
  })

  it('stays within budget, or explains the conflict — never silently over', () => {
    const room = roomWithReplaceable()
    for (const theme of THEMES) {
      for (const budget of [usd(20000), usd(60000), usd(200000)]) {
        const proposal = buildProposal(room, theme, sampleCatalog, budget, 1)
        const summary = purchaseSummary(applied(room, proposal), sources, budget)
        expect(summary.budget === 'under' || proposal.conflicts.length > 0).toBe(true)
        expect(summary.budget).not.toBe('over')
      }
    }
  })

  it('explains when kept items alone already exceed the budget', () => {
    const room = roomWithReplaceable()
    const expensive: Room = { ...room, objects: room.objects.map((o) => (o.id === 'extra-chair' ? { ...o, keep: true } : o)) }
    const proposal = buildProposal(expensive, warm!, sampleCatalog, usd(100), 1)
    expect(proposal.conflicts.join(' ')).toMatch(/budget/i)
    expect(proposal.commands.filter((c) => c.type === 'add')).toHaveLength(0)
  })

  it('avoids unknown prices when a budget is set, so the budget stays checkable', () => {
    const room = sampleRoom()
    for (const theme of THEMES) {
      const proposal = buildProposal(room, theme, sampleCatalog, usd(200000), 1)
      const summary = purchaseSummary(applied(room, proposal), sources, usd(200000))
      expect(summary.subtotal.unpricedCount).toBe(0)
    }
  })

  it('is deterministic', () => {
    const room = roomWithReplaceable()
    expect(buildProposal(room, colorful!, sampleCatalog, usd(80000), 3)).toEqual(buildProposal(room, colorful!, sampleCatalog, usd(80000), 3))
  })

  it('places every addition inside the room without colliding', () => {
    const room = sampleRoom()
    for (const theme of THEMES) {
      const result = applyCommands(room, buildProposal(room, theme, sampleCatalog, null, 1).commands, 'auto')
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.warnings).toEqual([])
    }
  })

  it('one apply and one undo restore the room and the subtotal (RF6)', () => {
    const store = createDesignStore()
    store.getState().loadRoom(roomWithReplaceable(), usd(80000))
    const before = store.getState().committed!
    const subBefore = subtotal(purchaseLines(before.room, sources))
    const proposal = buildProposal(before.room, warm!, sampleCatalog, before.budget, before.revision)
    expect(store.getState().apply(proposal.commands, { actor: 'auto', baseRevision: proposal.baseRevision }).ok).toBe(true)
    expect(store.getState().committed!.room).not.toEqual(before.room)
    store.getState().undo()
    expect(store.getState().committed!.room).toEqual(before.room)
    expect(subtotal(purchaseLines(store.getState().committed!.room, sources))).toEqual(subBefore)
  })

  it('describes each change with its cost', () => {
    const proposal = buildProposal(roomWithReplaceable(), minimal!, sampleCatalog, null, 1)
    expect(proposal.notes.some((note) => /^Swapped .+ · [+−]?\$/.test(note))).toBe(true)
    expect(proposal.notes.some((note) => /^Added .+ · \+\$/.test(note))).toBe(true)
  })

  it('leaves an item alone when nothing in its category fits its spot', () => {
    const room = sampleRoom()
    const odd = { ...lamp('odd'), category: 'refrigerator', offerId: undefined, variantId: undefined }
    const withOdd: Room = { ...room, objects: [...room.objects, odd] }
    const after = applied(withOdd, buildProposal(withOdd, warm!, sampleCatalog, null, 1))
    expect(after.objects.find((o) => o.id === 'odd')).toEqual(odd)
  })
})

describe('proposalOutcome', () => {
  it('reports the resulting room and its purchase summary without touching the input room', () => {
    const room = sampleRoom()
    const proposal = buildProposal(room, warm!, sampleCatalog, usd(60000), 1)
    const outcome = proposalOutcome(room, proposal, sources, usd(60000))
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.summary.lines.length).toBeGreaterThan(0)
    expect(outcome.summary.budget).toBe('under')
    expect(room.objects).toHaveLength(4)
  })

  it('fails readably when the proposal no longer applies', () => {
    const room = sampleRoom()
    const proposal = buildProposal(roomWithReplaceable(), minimal!, sampleCatalog, null, 1)
    const outcome = proposalOutcome(room, proposal, sources, null)
    expect(outcome.ok).toBe(false)
  })
})
