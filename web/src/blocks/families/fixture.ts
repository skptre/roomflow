/**
 * Built-in fixtures a room scan finds (RoomPlan: sink, toilet, bathtub,
 * fireplace, stairs) and built-in closet doors. Parts of the room rather than
 * things to buy: drawn cleanly at the scanned size so the room reads right.
 */
import { defineFamily } from '../family'
import { cylinder, lathe, place, slab, sphere } from '../kit'
import { HARD } from './shared'

export const sink = defineFamily({
  id: 'sink',
  label: 'Sink',
  blocks: {
    // Narrow sinks stand on a pedestal; anything wider sits in a cabinet with a counter.
    base: { options: ['vanity', 'pedestal'], default: (size) => (size.width < 0.6 && size.depth < 0.55 ? 'pedestal' : 'vanity') },
  },
  params: {},
  slots: {
    cabinet: { kind: 'wood', color: '#ece8e1' },
    counter: { kind: 'stone', color: '#dcd8d0' },
    basin: { kind: 'ceramic', color: '#f5f4f0' },
    faucet: { kind: 'metal', color: '#b8bbbd' },
  },
  build(ctx) {
    const { w, h, d } = ctx
    const pedestal = ctx.block('base') === 'pedestal'
    const deckT = Math.min(0.03, h * 0.05)
    const deck = h - deckT
    // The basin opening: centered left-right, a little forward of the faucet.
    const bw = Math.min(w * 0.62, 0.55)
    const bd = Math.min(d * 0.55, 0.4)
    const bz = Math.min(0.03, d * 0.05)
    const [ox0, ox1, oz0, oz1] = [-bw / 2, bw / 2, bz - bd / 2, bz + bd / 2]
    const depth = Math.min(0.14, deck * 0.3)
    const top = pedestal ? 'basin' : 'counter'
    // Deck around the opening (four pieces), so the basin reads as a recess.
    ctx.add(top, slab(-w / 2, w / 2, deck, h, -d / 2, oz0, HARD))
    ctx.add(top, slab(-w / 2, w / 2, deck, h, oz1, d / 2, HARD))
    ctx.add(top, slab(-w / 2, ox0, deck, h, oz0 - 0.001, oz1 + 0.001, HARD))
    ctx.add(top, slab(ox1, w / 2, deck, h, oz0 - 0.001, oz1 + 0.001, HARD))
    // The bowl: walls and a floor under the opening.
    const wall = 0.012
    ctx.add('basin', slab(ox0, ox1, deck - depth, deck - depth + wall, oz0, oz1, 0.01))
    ctx.add('basin', slab(ox0, ox0 + wall, deck - depth, deck + 0.002, oz0, oz1, 0.004))
    ctx.add('basin', slab(ox1 - wall, ox1, deck - depth, deck + 0.002, oz0, oz1, 0.004))
    ctx.add('basin', slab(ox0, ox1, deck - depth, deck + 0.002, oz0, oz0 + wall, 0.004))
    ctx.add('basin', slab(ox0, ox1, deck - depth, deck + 0.002, oz1 - wall, oz1, 0.004))
    // Faucet spout: a scan's box ends at the counter, so only a low spout reaching over the basin shows.
    const fz = (-d / 2 + oz0) / 2
    ctx.add('faucet', slab(-0.012, 0.012, h - 0.006, h, fz - 0.012, Math.min(oz0 + 0.06, d / 2 - 0.01), 0.004))

    if (pedestal) {
      const r = Math.min(w, d) * 0.16
      ctx.add('basin', lathe([[r * 1.3, 0], [r * 1.3, 0.02], [r, 0.05], [r * 0.8, deck * 0.5], [r * 1.2, deck - depth]], 32))
      return
    }
    // Vanity: a cabinet with two doors and small knobs under the counter.
    const face = d / 2 - 0.03
    ctx.add('cabinet', slab(-w / 2 + 0.01, w / 2 - 0.01, 0.06, deck, -d / 2, face - 0.018, HARD))
    ctx.add('cabinet', slab(-w / 2 + 0.03, w / 2 - 0.03, 0, 0.06, -d / 2 + 0.02, face - 0.04, HARD))
    const doors = w > 1.2 ? 4 : 2
    const cw = (w - 0.03 - 0.004 * (doors - 1)) / doors
    for (let i = 0; i < doors; i++) {
      const dx0 = -w / 2 + 0.015 + i * (cw + 0.004)
      ctx.add('cabinet', slab(dx0, dx0 + cw, 0.065, deck - 0.01, face - 0.018, face, 0.003))
      const kx = i % 2 === 0 ? dx0 + cw - 0.035 : dx0 + 0.035
      ctx.add('faucet', place(sphere(0.012, 0.012, 0.012, 12, 8), { x: kx, y: deck - 0.08, z: face + 0.012 }))
    }
  },
})

export const toilet = defineFamily({
  id: 'toilet',
  label: 'Toilet',
  blocks: {},
  params: {},
  slots: {
    body: { kind: 'ceramic', color: '#f5f4f0' },
    seat: { kind: 'ceramic', color: '#f0efeb' },
    flush: { kind: 'metal', color: '#b8bbbd' },
  },
  build(ctx) {
    const { w, h, d } = ctx
    // Tank against the wall (back, -Z), bowl reaching forward.
    const tankD = Math.min(0.22, d * 0.3)
    const seatY = Math.min(0.42, h * 0.55)
    const tankY = Math.min(seatY + 0.02, h * 0.55)
    ctx.add('body', slab(-w / 2 + 0.01, w / 2 - 0.01, tankY, h, -d / 2, -d / 2 + tankD, 0.02))
    ctx.add('flush', slab(-0.03, 0.03, h - 0.003, h, -d / 2 + tankD * 0.35, -d / 2 + tankD * 0.65, 0.002))
    // Bowl: an oval tapering to a narrow foot.
    const bowlD = d - tankD * 0.6
    const cz = d / 2 - bowlD / 2
    const rx = Math.min(w / 2 - 0.01, 0.19)
    const rz = bowlD / 2
    const bowl = lathe([[0.45, 0], [0.5, 0.05], [0.62, 0.45], [0.9, 0.8], [1, 1]], 40)
    bowl.scale(rx, seatY - 0.03, rz)
    ctx.add('body', place(bowl, { z: cz }))
    // Seat and closed lid, one oval.
    const lid = cylinder(1, 1, 0.03, 40)
    lid.scale(rx, 1, rz)
    ctx.add('seat', place(lid, { y: seatY - 0.015, z: cz }))
  },
})

export const bathtub = defineFamily({
  id: 'bathtub',
  label: 'Bathtub',
  blocks: {},
  params: {},
  slots: {
    tub: { kind: 'ceramic', color: '#f5f4f0' },
    faucet: { kind: 'metal', color: '#b8bbbd' },
  },
  build(ctx) {
    const { w, h, d } = ctx
    const rim = Math.min(0.09, Math.min(w, d) * 0.12)
    const floor = Math.min(0.12, h * 0.25)
    // A solid outer shell with a hollow inside: floor plus four rim walls.
    ctx.add('tub', slab(-w / 2, w / 2, 0, floor, -d / 2, d / 2, 0.02))
    ctx.add('tub', slab(-w / 2, w / 2, 0, h, -d / 2, -d / 2 + rim, 0.02))
    ctx.add('tub', slab(-w / 2, w / 2, 0, h, d / 2 - rim, d / 2, 0.02))
    ctx.add('tub', slab(-w / 2, -w / 2 + rim, 0, h, -d / 2 + rim - 0.002, d / 2 - rim + 0.002, 0.02))
    ctx.add('tub', slab(w / 2 - rim, w / 2, 0, h, -d / 2 + rim - 0.002, d / 2 - rim + 0.002, 0.02))
    // A spout on the left end's rim.
    ctx.add('faucet', slab(-w / 2 + 0.02, -w / 2 + rim + 0.06, h - 0.004, h, -0.015, 0.015, 0.004))
  },
})

export const fireplace = defineFamily({
  id: 'fireplace',
  label: 'Fireplace',
  blocks: {},
  params: {},
  slots: {
    surround: { kind: 'stone', color: '#e6e1d8' },
    firebox: { kind: 'stone', color: '#2e2c2a' },
    mantel: { kind: 'wood', color: '#9a7a5c' },
  },
  build(ctx) {
    const { w, h, d } = ctx
    const hearth = Math.min(0.06, h * 0.06)
    const mantelT = Math.min(0.06, h * 0.06)
    const openW = w * 0.55
    const openH = Math.min(h * 0.55, h - mantelT - 0.15)
    const back = -d / 2
    const front = d / 2 - Math.min(0.04, d * 0.1)
    // Hearth along the floor, a surround with an opening, a mantel shelf on top.
    ctx.add('surround', slab(-w / 2, w / 2, 0, hearth, back, d / 2, HARD))
    ctx.add('surround', slab(-w / 2 + 0.03, -openW / 2, hearth, h - mantelT, back, front, HARD))
    ctx.add('surround', slab(openW / 2, w / 2 - 0.03, hearth, h - mantelT, back, front, HARD))
    ctx.add('surround', slab(-openW / 2 - 0.001, openW / 2 + 0.001, hearth + openH, h - mantelT, back, front, HARD))
    ctx.add('firebox', slab(-openW / 2, openW / 2, hearth, hearth + openH, back, back + Math.max(0.02, (front - back) * 0.4), 0.002))
    ctx.add('mantel', slab(-w / 2, w / 2, h - mantelT, h, back, d / 2, HARD))
  },
})

export const stairs = defineFamily({
  id: 'stairs',
  label: 'Stairs',
  blocks: {},
  params: {},
  slots: {
    treads: { kind: 'wood', color: '#b88c62' },
    risers: { kind: 'wood', color: '#ece6dc' },
  },
  build(ctx) {
    const { w, h, d } = ctx
    // Steps climb toward the back (-Z): about 18 cm up and an equal share of the run each.
    const count = Math.max(2, Math.min(24, Math.round(h / 0.18)))
    const rise = h / count
    const run = d / count
    const tread = Math.min(0.03, rise * 0.3)
    for (let i = 0; i < count; i++) {
      const z1 = d / 2 - i * run
      const z0 = z1 - run
      const top = (i + 1) * rise
      ctx.add('risers', slab(-w / 2, w / 2, 0, top - tread, z0, z1, 0.002))
      ctx.add('treads', slab(-w / 2, w / 2, top - tread, top, z0, Math.min(d / 2, z1 + 0.001), 0.003))
    }
  },
})

export const closetDoors = defineFamily({
  id: 'closet-doors',
  label: 'Closet doors',
  blocks: {},
  params: {},
  slots: {
    doors: { kind: 'wood', color: '#efebe4' },
    frame: { kind: 'wood', color: '#e2dbd0' },
    handles: { kind: 'metal', color: '#9b9ea1' },
  },
  build(ctx) {
    const { w, h, d } = ctx
    // Door leaves roughly 60 cm wide filling a thin trim frame, with a pull at each meeting edge.
    const trim = Math.min(0.04, w * 0.05)
    const t = Math.min(0.03, d * 0.6)
    const z0 = -d / 2
    ctx.add('frame', slab(-w / 2, -w / 2 + trim, 0, h, z0, d / 2, 0.003))
    ctx.add('frame', slab(w / 2 - trim, w / 2, 0, h, z0, d / 2, 0.003))
    ctx.add('frame', slab(-w / 2, w / 2, h - trim, h, z0, d / 2, 0.003))
    const inner = w - trim * 2
    const leaves = Math.max(1, Math.round(inner / 0.6))
    const lw = (inner - 0.004 * (leaves - 1)) / leaves
    for (let i = 0; i < leaves; i++) {
      const x0 = -w / 2 + trim + i * (lw + 0.004)
      ctx.add('doors', slab(x0, x0 + lw, 0.01, h - trim - 0.004, z0, z0 + t, 0.003))
      const px = i % 2 === 0 ? x0 + lw - 0.04 : x0 + 0.04
      if (d / 2 - (z0 + t) > 0.004) ctx.add('handles', slab(px - 0.008, px + 0.008, h * 0.42, h * 0.52, z0 + t, Math.min(d / 2, z0 + t + 0.02), 0.003))
    }
  },
})
