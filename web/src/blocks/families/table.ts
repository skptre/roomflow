/** Tables: coffee, side, dining, desk, console. A top on one of several bases. */
import { Shape, Vector3 } from 'three'
import { defineFamily } from '../family'
import { cylinder, extrudeShape, lathe, place, slab, tube, type Geo } from '../kit'
import { PROPORTION, handle, hardEdge, leg, legGrid, legHalfWidth, type LegStyle } from './shared'

/** Plan outline of a top (x across, second axis = depth), centered. Chunky rectangles get softly rounded corners. */
function planShape(kind: string, w: number, d: number, chunky = false): Shape {
  if (kind === 'round' || kind === 'oval') return new Shape().absellipse(0, 0, w / 2, d / 2, 0, Math.PI * 2, false, 0)
  const r = kind === 'rounded' ? Math.min(0.1, w / 4, d / 4) : chunky ? Math.min(0.035, w / 4, d / 4) : 0.006
  return new Shape()
    .moveTo(-w / 2 + r, -d / 2)
    .lineTo(w / 2 - r, -d / 2)
    .quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r)
    .lineTo(w / 2, d / 2 - r)
    .quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2)
    .lineTo(-w / 2 + r, d / 2)
    .quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r)
    .lineTo(-w / 2, -d / 2 + r)
    .quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2)
    .closePath()
}

/** A flat plan shape extruded `thickness` up from y0. */
function planSlab(kind: string, w: number, d: number, y0: number, thickness: number, bevel: number, chunky = false): Geo {
  // Shape XY → floor XZ (rotateX −90° maps shape y to −z; the shapes are symmetric).
  return place(extrudeShape(planShape(kind, w, d, chunky), thickness, bevel).rotateX(-Math.PI / 2), { y: y0 })
}

export const table = defineFamily({
  id: 'table',
  label: 'Table',
  blocks: {
    top: { options: ['rect', 'rounded', 'round', 'oval'], default: 'rect' },
    base: { options: ['legs', 'hairpin', 'trestle', 'pedestal', 'sled', 'panel', 'cube'], default: 'legs' },
    legStyle: { options: ['tapered', 'straight', 'turned', 'block', 'metal'], default: 'tapered' },
    shelf: { options: ['none', 'lower'], default: 'none' },
    drawer: { options: ['none', '1', '2'], default: 'none' },
    proportion: PROPORTION,
  },
  params: {
    topThickness: { min: 0.012, max: 0.08, default: 0.032 },
    legInset: { min: 0, max: 0.25, default: 0.04 },
    shelfHeight: { min: 0.06, max: 0.35, default: 0.12 },
  },
  slots: {
    top: { kind: 'wood', color: '#b08a62' },
    base: { kind: 'wood', color: '#b08a62' },
  },
  build(ctx) {
    const topKind = ctx.block('top')
    // A round top is a circle: in a longer box (often an estimated size) it takes the shorter side.
    const h = ctx.h
    const w = topKind === 'round' ? Math.min(ctx.w, ctx.d) : ctx.w
    const d = topKind === 'round' ? Math.min(ctx.w, ctx.d) : ctx.d
    const base = ctx.block('base')
    const chunky = ctx.block('proportion') === 'chunky'
    const HARD = hardEdge(chunky)
    const t = Math.min(ctx.param('topThickness'), h * 0.25)
    const under = h - t
    const round = topKind === 'round' || topKind === 'oval'
    ctx.add('top', planSlab(topKind, w, d, under, t, chunky ? Math.min(0.014, t / 2.6) : Math.min(0.006, t / 3), chunky))

    const styleBlock = ctx.block('legStyle') as LegStyle
    const style: LegStyle = base === 'hairpin' ? 'hairpin' : styleBlock
    if (style === 'metal' || base === 'hairpin' || base === 'sled') ctx.suggest('base', 'metal', '#2b2b2c')
    const inset = ctx.param('legInset')

    // Leg spots: corners of the inset rectangle, or on the ellipse for round tops.
    const legSpots = (): Array<[number, number]> => {
      if (!round) return legGrid(-w / 2, w / 2, -d / 2, d / 2, style, inset, chunky)
      const half = legHalfWidth(style, chunky)
      const a = Math.max(0.01, w / 2 - inset - half * 1.5)
      const b = Math.max(0.01, d / 2 - inset - half * 1.5)
      return [0, 1, 2, 3].map((i) => {
        const angle = Math.PI / 4 + (i * Math.PI) / 2
        return [Math.cos(angle) * a * 0.92, Math.sin(angle) * b * 0.92]
      })
    }

    switch (base) {
      case 'legs':
      case 'hairpin': {
        const spots = legSpots()
        for (const [x, z] of spots) ctx.add('base', leg(style, under + 0.001, x, z, chunky))
        if (ctx.block('shelf') === 'lower' && !round) {
          const xs = spots.map(([x]) => x)
          const zs = spots.map(([, z]) => z)
          const half = legHalfWidth(style, chunky)
          const sh = Math.min(ctx.param('shelfHeight'), under * 0.5)
          ctx.add('top', slab(Math.min(...xs) - half, Math.max(...xs) + half, sh, sh + Math.min(0.022, t), Math.min(...zs) - half, Math.max(...zs) + half, HARD))
        }
        break
      }
      case 'trestle': {
        const foot = Math.min(0.05, under * 0.1)
        for (const sign of [-1, 1]) {
          const x = sign * Math.max(0.05, w / 2 - Math.max(inset, 0.18))
          ctx.add('base', slab(x - 0.035, x + 0.035, 0, foot, -d / 2 + 0.06, d / 2 - 0.06, HARD))
          ctx.add('base', slab(x - 0.03, x + 0.03, foot - 0.002, under - 0.04, -0.04, 0.04, HARD))
          ctx.add('base', slab(x - 0.035, x + 0.035, under - 0.045, under, -d / 2 + 0.08, d / 2 - 0.08, HARD))
        }
        const span = Math.max(0.05, w / 2 - Math.max(inset, 0.18))
        ctx.add('base', slab(-span, span, under * 0.35, under * 0.35 + 0.05, -0.02, 0.02, HARD))
        break
      }
      case 'pedestal': {
        const r = Math.max(0.04, Math.min(w, d) * 0.1)
        const footR = Math.min(Math.min(w, d) * 0.36, 0.34)
        ctx.add('base', lathe([[0, 0], [footR, 0], [footR, 0.018], [footR * 0.55, 0.05], [r, 0.12], [r, under], [0, under]], 48))
        break
      }
      case 'sled': {
        const r = 0.011
        for (const sign of [-1, 1]) {
          const x = sign * (w / 2 - Math.max(inset, 0.03) - r)
          const z0 = -d / 2 + Math.max(inset, 0.03) + r
          const z1 = d / 2 - Math.max(inset, 0.03) - r
          ctx.add('base', tube([new Vector3(x, under - r, z0), new Vector3(x, r, z0), new Vector3(x, r, z1), new Vector3(x, under - r, z1)], r, 10))
        }
        break
      }
      case 'panel': {
        // Waterfall: sides fold down from the top in the same material.
        const pt = Math.max(t, 0.02)
        ctx.add('top', slab(-w / 2, -w / 2 + pt, 0, under + 0.001, -d / 2, d / 2, 0.004))
        ctx.add('top', slab(w / 2 - pt, w / 2, 0, under + 0.001, -d / 2, d / 2, 0.004))
        break
      }
      case 'cube': {
        const i = Math.max(inset, 0.04)
        ctx.add('base', round ? place(cylinder(Math.max(0.03, Math.min(w, d) / 2 - i), Math.max(0.03, Math.min(w, d) / 2 - i), under + 0.001, 48), { y: (under + 0.001) / 2 }) : slab(-w / 2 + i, w / 2 - i, 0, under + 0.001, -d / 2 + i, d / 2 - i, HARD))
        break
      }
    }

    // Drawers hang under the top at the front (desks, consoles).
    const drawers = ctx.block('drawer')
    if (drawers !== 'none' && !round && (base === 'legs' || base === 'hairpin')) {
      const count = Number(drawers)
      const dh = Math.min(0.11, under * 0.2)
      const half = legHalfWidth(style, chunky)
      const x0 = -w / 2 + inset + half * 2 + 0.01
      const x1 = w / 2 - inset - half * 2 - 0.01
      if (x1 - x0 > 0.2) {
        const face = Math.min(d / 2 - inset - 0.004, d / 2 - 0.026)
        ctx.add('top', slab(x0, x1, under - dh, under + 0.001, -d / 2 + inset + 0.02, face - 0.018, HARD))
        const width = (x1 - x0 - 0.004 * (count - 1)) / count
        for (let i = 0; i < count; i++) {
          const fx0 = x0 + i * (width + 0.004)
          ctx.add('top', slab(fx0, fx0 + width, under - dh + 0.004, under - 0.004, face - 0.018, face, chunky ? 0.01 : 0.003))
          const pull = handle('knob', fx0 + width / 2, under - dh / 2, face, false, 0.12, chunky)
          if (pull) ctx.add('base', pull)
        }
      }
    }
  },
})
