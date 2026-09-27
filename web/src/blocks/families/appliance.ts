/**
 * Appliances a room scan finds (RoomPlan: refrigerator, television, stove,
 * oven, dishwasher, washer/dryer). Stylized like the furniture: the right
 * silhouette, door splits and handles at the scanned size, no brand detail.
 * Bodies are satin enamel rather than metal: full metalness reads near-black
 * under the scene's soft reflections, and a stainless fridge should read light.
 * The variation comes from the size when nothing says otherwise: a short
 * fridge is a mini fridge, a wide one has French doors; a tall washer is a
 * stacked pair; a TV deep enough for a stand stands on one.
 */
import { defineFamily } from '../family'
import { cylinder, lathe, place, slab } from '../kit'
import { HARD } from './shared'

/** Gap between doors, and how far doors sit proud of the cabinet. */
const REVEAL = 0.006
const DOOR = 0.03
/** Handles stand this far off the doors (kept inside the listed depth). */
const PULL = 0.035

export const fridge = defineFamily({
  id: 'fridge',
  label: 'Refrigerator',
  blocks: {
    style: {
      options: ['mini', 'top-freezer', 'bottom-freezer', 'french-door', 'side-by-side'],
      default: (size) => (size.height < 1.2 ? 'mini' : size.width >= 0.8 ? 'french-door' : 'top-freezer'),
    },
  },
  params: {},
  slots: {
    body: { kind: 'ceramic', color: '#d9dcdb' },
    handles: { kind: 'metal', color: '#9b9ea1' },
    trim: { kind: 'metal', color: '#3b3c3e' },
  },
  build(ctx) {
    const { w, h, d } = ctx
    const style = ctx.block('style')
    const face = d / 2 - PULL
    const back = face - DOOR
    const kick = Math.min(0.08, h * 0.06)
    ctx.add('body', slab(-w / 2 + 0.004, w / 2 - 0.004, 0, h, -d / 2, back + 0.001, HARD))
    // A dark toe grille under the doors.
    ctx.add('trim', slab(-w / 2 + 0.02, w / 2 - 0.02, 0.01, kick, back, face - 0.01, 0.002))

    const x0 = -w / 2
    const x1 = w / 2
    const y0 = kick + REVEAL
    const y1 = h - REVEAL
    const door = (dx0: number, dx1: number, dy0: number, dy1: number) => ctx.add('body', slab(dx0, dx1, dy0, dy1, back, face, HARD))
    const bar = (x: number, ya: number, yb: number) => {
      ctx.add('handles', slab(x - 0.012, x + 0.012, ya, yb, face + 0.012, face + PULL - 0.002, 0.005))
      for (const y of [ya + 0.02, yb - 0.02]) ctx.add('handles', slab(x - 0.008, x + 0.008, y - 0.012, y + 0.012, face - 0.001, face + 0.014, 0.002))
    }
    const across = (y: number, xa: number, xb: number) => {
      ctx.add('handles', slab(xa, xb, y - 0.012, y + 0.012, face + 0.012, face + PULL - 0.002, 0.005))
      for (const x of [xa + 0.02, xb - 0.02]) ctx.add('handles', slab(x - 0.012, x + 0.012, y - 0.008, y + 0.008, face - 0.001, face + 0.014, 0.002))
    }
    const edge = x1 - 0.05
    switch (style) {
      case 'mini':
        door(x0, x1, y0, y1)
        bar(edge, y1 - Math.min(0.35, (y1 - y0) * 0.55), y1 - 0.06)
        break
      case 'top-freezer': {
        const split = y0 + (y1 - y0) * 0.68
        door(x0, x1, split + REVEAL / 2, y1)
        door(x0, x1, y0, split - REVEAL / 2)
        bar(edge, split + 0.05, Math.min(y1 - 0.05, split + 0.3))
        bar(edge, split - Math.min(0.55, (split - y0) * 0.5), split - 0.06)
        break
      }
      case 'bottom-freezer': {
        const split = y0 + (y1 - y0) * 0.32
        door(x0, x1, split + REVEAL / 2, y1)
        door(x0, x1, y0, split - REVEAL / 2)
        bar(edge, split + 0.08, Math.min(y1 - 0.08, split + 0.6))
        across(split - 0.07, x0 + w * 0.25, x1 - w * 0.25)
        break
      }
      case 'french-door': {
        const split = y0 + (y1 - y0) * 0.32
        door(x0, -REVEAL / 2, split + REVEAL / 2, y1)
        door(REVEAL / 2, x1, split + REVEAL / 2, y1)
        door(x0, x1, y0, split - REVEAL / 2)
        bar(-0.045, split + 0.08, Math.min(y1 - 0.08, split + 0.65))
        bar(0.045, split + 0.08, Math.min(y1 - 0.08, split + 0.65))
        across(split - 0.07, x0 + w * 0.25, x1 - w * 0.25)
        break
      }
      default: {
        // Side-by-side: freezer on the left, fridge on the right, both full height.
        const mid = x0 + w * 0.42
        door(x0, mid - REVEAL / 2, y0, y1)
        door(mid + REVEAL / 2, x1, y0, y1)
        const ya = y0 + (y1 - y0) * 0.3
        const yb = y0 + (y1 - y0) * 0.75
        bar(mid - 0.045, ya, yb)
        bar(mid + 0.045, ya, yb)
      }
    }
  },
})

export const tv = defineFamily({
  id: 'tv',
  label: 'Television',
  blocks: {
    // A scan's box includes a stand when the TV stands on one: deep boxes stand, thin ones hang.
    stand: { options: ['wall', 'feet', 'pedestal'], default: (size) => (size.depth > 0.15 ? 'feet' : 'wall') },
  },
  params: {},
  slots: {
    screen: { kind: 'metal', color: '#16181b' },
    frame: { kind: 'metal', color: '#2b2c2f' },
    stand: { kind: 'metal', color: '#2b2c2f' },
  },
  build(ctx) {
    const { w, h, d } = ctx
    const stand = ctx.block('stand')
    const t = Math.min(0.045, d)
    const legs = stand === 'wall' ? 0 : Math.min(0.1, h * 0.15)
    const bezel = Math.min(0.012, w * 0.02)
    const z0 = stand === 'wall' ? -d / 2 : -t / 2
    ctx.add('frame', slab(-w / 2, w / 2, legs, h, z0, z0 + t - 0.003, 0.003))
    ctx.add('screen', slab(-w / 2 + bezel, w / 2 - bezel, legs + bezel, h - bezel, z0 + t - 0.006, z0 + t, 0.001))
    if (stand === 'feet') {
      // Two slim feet near the ends, splayed front to back.
      for (const x of [-w / 2 + w * 0.12, w / 2 - w * 0.12]) {
        ctx.add('stand', slab(x - 0.012, x + 0.012, 0, legs + 0.02, -0.02, 0.02, 0.004))
        ctx.add('stand', slab(x - 0.015, x + 0.015, 0, 0.012, -d / 2 + 0.01, d / 2 - 0.01, 0.004))
      }
    } else if (stand === 'pedestal') {
      const plate = Math.min(w * 0.35, 0.45)
      ctx.add('stand', slab(-0.03, 0.03, 0, legs + 0.02, -0.02, 0.02, 0.004))
      ctx.add('stand', slab(-plate / 2, plate / 2, 0, 0.014, -d / 2 + 0.01, d / 2 - 0.01, 0.006))
    }
  },
})

/** A round washer/dryer door: a chrome ring around dark glass, facing +Z. */
function porthole(ctx: Parameters<(typeof appliance)['build']>[0], cx: number, cy: number, r: number, face: number) {
  const ring = lathe([[r * 0.78, 0], [r, 0], [r, 0.02], [r * 0.78, 0.02]], 48)
  ctx.add('handles', place(ring, { x: cx, y: cy, z: face, rx: Math.PI / 2 }))
  ctx.add('panel', place(cylinder(r * 0.8, r * 0.8, 0.012, 40), { x: cx, y: cy, z: face + 0.004, rx: Math.PI / 2 }))
}

export const appliance = defineFamily({
  id: 'appliance',
  label: 'Appliance',
  blocks: {
    front: { options: ['range', 'oven', 'dishwasher', 'laundry'], default: 'range' },
  },
  params: {},
  slots: {
    body: { kind: 'ceramic', color: '#d9dcdb' },
    panel: { kind: 'metal', color: '#1f2123' },
    handles: { kind: 'metal', color: '#9b9ea1' },
  },
  build(ctx) {
    const { w, h, d } = ctx
    const front = ctx.block('front')
    const face = d / 2 - PULL
    const x0 = -w / 2 + 0.01
    const x1 = w / 2 - 0.01
    const bar = (y: number) => {
      ctx.add('handles', slab(x0 + w * 0.12, x1 - w * 0.12, y - 0.012, y + 0.012, face + 0.012, face + PULL - 0.002, 0.005))
      for (const x of [x0 + w * 0.14, x1 - w * 0.14]) ctx.add('handles', slab(x - 0.01, x + 0.01, y - 0.008, y + 0.008, face - 0.001, face + 0.014, 0.002))
    }

    if (front === 'laundry') {
      ctx.add('body', slab(-w / 2 + 0.004, w / 2 - 0.004, 0, h, -d / 2, face, HARD))
      // A tall laundry box is a dryer stacked on a washer: one door per unit.
      const units = h > 1.4 ? 2 : 1
      const unit = h / units
      for (let i = 0; i < units; i++) {
        const top = (i + 1) * unit
        ctx.add('panel', slab(x0 + 0.02, x1 - 0.02, top - Math.min(0.1, unit * 0.12), top - 0.02, face - 0.002, face + 0.004, 0.002))
        const r = Math.min(w * 0.3, unit * 0.3)
        porthole(ctx, 0, top - unit * 0.52, r, face)
        if (i === 0 && units === 2) ctx.add('handles', slab(x0, x1, unit - 0.004, unit + 0.004, face - 0.002, face + 0.003, 0.001))
      }
      return
    }

    if (front === 'dishwasher') {
      const kick = Math.min(0.1, h * 0.12)
      ctx.add('body', slab(-w / 2 + 0.004, w / 2 - 0.004, 0, h, -d / 2, face - DOOR, HARD))
      ctx.add('panel', slab(x0 + 0.02, x1 - 0.02, 0.01, kick, face - DOOR, face - 0.01, 0.002))
      ctx.add('body', slab(x0, x1, kick + REVEAL, h - REVEAL, face - DOOR, face, HARD))
      ctx.add('panel', slab(x0 + 0.01, x1 - 0.01, h - 0.07, h - 0.02, face - 0.002, face + 0.003, 0.002))
      bar(h - 0.11)
      return
    }

    // Range and oven: a box with an oven door (dark window, bar handle) and a control strip.
    const range = front === 'range'
    // A range taller than a counter has a backguard with the knobs.
    const guard = range && h > 1.0 ? Math.min(0.2, h - 0.9) : 0
    const top = h - guard
    // A range's body stops under its cooktop so the burners stay inside the scanned height.
    const deck = range ? top - 0.016 : top
    ctx.add('body', slab(-w / 2 + 0.004, w / 2 - 0.004, 0, deck, -d / 2, face - DOOR, HARD))
    if (range) {
      ctx.add('panel', slab(-w / 2 + 0.01, w / 2 - 0.01, deck - 0.004, deck + 0.006, -d / 2 + 0.01, face - DOOR - 0.005, 0.003))
      // Four burners on the cooktop.
      const rz = Math.min(d * 0.16, 0.12)
      for (const [bx, bz] of [[-w * 0.24, -d * 0.18], [w * 0.24, -d * 0.18], [-w * 0.24, d * 0.14], [w * 0.24, d * 0.14]] as const) {
        ctx.add('handles', place(cylinder(rz * 0.7, rz * 0.7, 0.008, 28), { x: bx, y: deck + 0.01, z: bz }))
      }
      if (guard > 0) {
        ctx.add('body', slab(-w / 2 + 0.004, w / 2 - 0.004, top, h, -d / 2, -d / 2 + 0.06, HARD))
        for (const kx of [-0.3, -0.15, 0.15, 0.3]) ctx.add('handles', place(cylinder(0.018, 0.018, 0.02, 20), { x: kx * w, y: top + guard * 0.5, z: -d / 2 + 0.07, rx: Math.PI / 2 }))
      }
    }
    const strip = Math.min(0.1, deck * 0.14)
    const doorTop = deck - strip - REVEAL
    const doorBottom = range ? Math.min(0.12, top * 0.12) : REVEAL
    ctx.add('body', slab(x0, x1, doorBottom, doorTop, face - DOOR, face, HARD))
    ctx.add('panel', slab(x0 + w * 0.12, x1 - w * 0.12, doorBottom + (doorTop - doorBottom) * 0.2, doorTop - (doorTop - doorBottom) * 0.25, face - 0.002, face + 0.003, 0.004))
    ctx.add('panel', slab(x0, x1, deck - strip, deck - 0.004, face - DOOR, face - 0.004, 0.002))
    if (!range || guard === 0) for (const kx of [-0.3, -0.15, 0.15, 0.3]) ctx.add('handles', place(cylinder(0.016, 0.016, 0.018, 20), { x: kx * w, y: deck - strip / 2, z: face + 0.004, rx: Math.PI / 2 }))
    bar(doorTop - 0.05)
    if (range) ctx.add('panel', slab(x0 + 0.02, x1 - 0.02, 0.01, doorBottom - REVEAL, face - DOOR, face - 0.01, 0.002))
  },
})
