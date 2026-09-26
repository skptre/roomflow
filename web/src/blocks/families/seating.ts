/**
 * Upholstered seating: sofas, sectionals, chaises (sofa family) and lounge
 * chairs, ottomans, benches (chair family). Both are built from one "seat
 * run": a straight row of seats with a back along its rear and optional arms
 * at its ends. A sectional is two runs meeting at a corner.
 */
import { Shape } from 'three'
import type { BuildContext } from '../family'
import { defineFamily } from '../family'
import { align, arcBand, cushion, extrudeShape, lathe, place, slab, type Geo } from '../kit'
import { GAP, SOFT, leg, legGrid, type LegStyle } from './shared'

type SeatSpec = {
  seatH: number
  legH: number
  cushionT: number
  armW: number
  armH: number
  backD: number
  backTop: number
  arm: string
  back: string
  base: string
}

type Run = {
  /** Run length along local +X and depth along local +Z (back at z = 0, seat front at z = D). */
  L: number
  D: number
  armStart: boolean
  armEnd: boolean
  seats: number
  /** Where seat cushions and deck begin/end along the run (a return run stops at the corner seat). */
  seatFrom?: number
  seatTo?: number
  /** False where a neighboring run provides the legs. */
  legsStart?: boolean
  legsEnd?: boolean
  /** Local → object space. */
  transform: (geometry: Geo) => Geo
}

const LEG_STYLE: Record<string, LegStyle> = { 'tapered-legs': 'tapered', 'block-legs': 'block', 'metal-legs': 'metal' }

function armGeometry(style: string, side: 'start' | 'end', run: Run, s: SeatSpec): Geo[] {
  const x0 = side === 'start' ? 0 : run.L - s.armW
  const x1 = x0 + s.armW
  const { D } = run
  switch (style) {
    case 'track':
      return [slab(x0, x1, s.legH, s.armH, 0, D, SOFT)]
    case 'rolled': {
      const roll = Math.min(s.armW * 0.55, (s.armH - s.legH) / 3)
      const cx = side === 'start' ? x0 + roll : x1 - roll
      return [
        slab(x0, x1, s.legH, s.armH - roll, 0, D, 0.03),
        slab(cx - roll, cx + roll, s.armH - 2 * roll, s.armH, 0, D, roll - 1e-4),
      ]
    }
    case 'slope': {
      // Side profile (z, y): full height at the back, easing down toward the front.
      const drop = Math.min(0.12, (s.armH - s.seatH) * 0.8)
      const shape = new Shape()
        .moveTo(0, s.legH)
        .lineTo(D, s.legH)
        .lineTo(D, s.armH - drop)
        .quadraticCurveTo(D * 0.6, s.armH, D * 0.3, s.armH)
        .lineTo(0, s.armH)
        .closePath()
      return [place(extrudeShape(shape, s.armW, 0.02).rotateY(-Math.PI / 2), { x: x1 })]
    }
    case 'flared': {
      // Front profile: narrow where it meets the base, flaring outward to the top.
      const inset = s.armW * 0.3
      const shape =
        side === 'start'
          ? new Shape().moveTo(x0 + inset, s.legH).lineTo(x1, s.legH).lineTo(x1, s.armH).lineTo(x0, s.armH).closePath()
          : new Shape().moveTo(x0, s.legH).lineTo(x1 - inset, s.legH).lineTo(x1, s.armH).lineTo(x0, s.armH).closePath()
      return [extrudeShape(shape, D, 0.025)]
    }
    default:
      return []
  }
}

/** One straight run of seats in local space, added to the context through run.transform. */
function seatRun(ctx: BuildContext, run: Run, s: SeatSpec) {
  const add = (slot: string, geometry: Geo) => ctx.add(slot, run.transform(geometry))
  const hasArms = s.arm !== 'none'
  const armStart = run.armStart && hasArms
  const armEnd = run.armEnd && hasArms
  const seatFrom = run.seatFrom ?? 0
  const seatTo = run.seatTo ?? run.L
  // Seat area between the arms. Tiny insets keep neighboring faces from sharing a plane.
  const ia = armStart ? s.armW : 0.003
  const ib = run.L - (armEnd ? s.armW : 0.003)

  if (armStart) armGeometry(s.arm, 'start', run, s).forEach((g) => add('upholstery', g))
  if (armEnd) armGeometry(s.arm, 'end', run, s).forEach((g) => add('upholstery', g))

  // Back frame, tucked 4 mm in from the arms' rear faces.
  const bx0 = armStart ? s.armW - 0.02 : 0
  const bx1 = armEnd ? run.L - s.armW + 0.02 : run.L
  add('upholstery', slab(bx0, bx1, s.legH, s.backTop, 0.004, s.backD, 0.04))

  let seatZ = s.backD
  if (s.back === 'channel') {
    const count = Math.max(2, Math.round((bx1 - bx0) / 0.15))
    const pitch = (bx1 - bx0) / count
    for (let i = 0; i < count; i++) {
      const cx0 = bx0 + i * pitch + 0.003
      const cx1 = bx0 + (i + 1) * pitch - 0.003
      add('upholstery', slab(cx0, cx1, s.seatH - 0.03, s.backTop - 0.012, s.backD - 0.01, s.backD + 0.07, Math.min(0.035, (cx1 - cx0) / 2 - 0.002)))
    }
    seatZ = s.backD + 0.06
  }

  // Deck under the cushions (reaching 1 cm into the arms).
  const sx0 = Math.max(ia, seatFrom)
  const sx1 = Math.min(ib, seatTo)
  add('upholstery', slab(sx0 - (sx0 === ia && armStart ? 0.01 : 0), sx1 + (sx1 === ib && armEnd ? 0.01 : 0), s.legH, s.seatH - s.cushionT, s.backD - 0.02, run.D - 0.006, 0.03))

  // Seat cushions, evenly split with a small gap (and a small gap where a corner seat begins).
  const cx0 = sx0 + (seatFrom > 0 ? 0.004 : 0)
  const width = sx1 - (seatTo < run.L ? 0.004 : 0) - cx0
  const seats = Math.max(1, run.seats)
  const cw = (width - GAP * (seats - 1)) / seats
  for (let i = 0; i < seats; i++) {
    const x = cx0 + i * (cw + GAP)
    add(
      'upholstery',
      align(cushion(cw, s.cushionT, run.D - seatZ, Math.min(0.045, s.cushionT / 2.5), 0.02), { x0: x, y0: s.seatH - s.cushionT, z0: seatZ }),
    )
    if (s.back === 'pillow') {
      const tilt = 0.14
      const thickness = Math.min(0.18, (run.D - seatZ) * 0.3)
      const room = ctx.h - 0.006 - (s.seatH - 0.02)
      const height = (room - thickness * Math.sin(tilt)) / Math.cos(tilt)
      if (height > 0.1) {
        const pillow = place(cushion(cw, thickness, height, 0.05, 0.025), { rx: Math.PI / 2 - tilt })
        add('upholstery', align(pillow, { x0: x, y0: s.seatH - 0.02, z0: s.backD - 0.015 }))
      }
    }
  }

  // Base: legs at the run's corners, or a recessed plinth.
  if (s.legH <= 0.004) return
  const legsStart = run.legsStart ?? true
  const legsEnd = run.legsEnd ?? true
  if (s.base === 'plinth') {
    add('legs', slab(legsStart ? 0.03 : 0, run.L - (legsEnd ? 0.03 : 0), 0, s.legH, 0.03, run.D - 0.03, 0.004))
    return
  }
  const style = LEG_STYLE[s.base] ?? 'tapered'
  for (const [x, z] of legGrid(0, run.L, 0, run.D, style, 0.03)) {
    if ((!legsStart && x < run.L / 2 && run.L > 0.3) || (!legsEnd && x > run.L / 2 && run.L > 0.3)) continue
    add('legs', leg(style, s.legH, x, z))
  }
}

function seatSpec(ctx: BuildContext, backTopFraction: number): SeatSpec {
  const seatH = Math.min(ctx.param('seatHeight'), ctx.h - 0.12)
  const cushionT = Math.min(ctx.param('cushionThickness'), seatH * 0.4)
  const legH = Math.max(0, Math.min(ctx.param('legHeight'), seatH - cushionT - 0.06))
  const armH = Math.min(Math.max(ctx.param('armHeight'), seatH + 0.06), ctx.h - 0.02)
  const back = ctx.block('back')
  return {
    seatH,
    legH,
    cushionT,
    armW: Math.min(ctx.param('armWidth'), ctx.w / 4),
    armH,
    backD: Math.min(ctx.param('backDepth'), ctx.d / 3),
    backTop: back === 'pillow' ? seatH + (ctx.h - seatH) * backTopFraction : ctx.h,
    arm: ctx.block('arm'),
    back,
    base: ctx.block('base'),
  }
}

const translate = (x: number, z: number) => (g: Geo) => g.translate(x, 0, z)

const seatParams = {
  seatHeight: { min: 0.3, max: 0.6, default: (size: { height: number }) => Math.min(0.44, size.height * 0.55) },
  legHeight: {
    min: 0,
    max: 0.3,
    default: (_: unknown, blocks: Readonly<Record<string, string>>) => (blocks.base === 'plinth' ? 0.035 : blocks.base === 'block-legs' ? 0.08 : 0.13),
  },
  armHeight: { min: 0.4, max: 1, default: (size: { height: number }) => Math.min(0.64, size.height - 0.04) },
  backDepth: { min: 0.1, max: 0.35, default: 0.2 },
  cushionThickness: { min: 0.08, max: 0.22, default: 0.15 },
} as const

function suggestLegs(ctx: BuildContext) {
  if (ctx.block('base') === 'metal-legs') ctx.suggest('legs', 'metal', '#2b2b2c')
}

export const sofa = defineFamily({
  id: 'sofa',
  label: 'Sofa',
  blocks: {
    shape: { options: ['straight', 'chaise-left', 'chaise-right', 'L-left', 'L-right'], default: 'straight' },
    arm: { options: ['track', 'rolled', 'slope', 'flared', 'none'], default: 'track' },
    back: { options: ['tight', 'pillow', 'channel'], default: 'pillow' },
    base: { options: ['tapered-legs', 'block-legs', 'metal-legs', 'plinth'], default: 'tapered-legs' },
  },
  params: {
    ...seatParams,
    armWidth: { min: 0.05, max: 0.35, default: (_: unknown, blocks: Readonly<Record<string, string>>) => (blocks.arm === 'rolled' ? 0.2 : 0.16) },
    seatDepth: { min: 0.55, max: 1.2, default: 0.98 },
    chaiseWidth: { min: 0.6, max: 1.3, default: 0.85 },
    seatCushions: { min: 1, max: 4, integer: true, default: (size) => Math.round((size.width - 0.32) / 0.72) },
  },
  slots: {
    upholstery: { kind: 'fabric', color: '#b9b2a6' },
    legs: { kind: 'wood', color: '#6b4a33' },
  },
  build(ctx) {
    const s = seatSpec(ctx, 0.5)
    suggestLegs(ctx)
    const { w, d } = ctx
    const shape = ctx.block('shape')
    const seats = ctx.param('seatCushions')
    if (shape === 'straight') {
      seatRun(ctx, { L: w, D: d, armStart: true, armEnd: true, seats, transform: translate(-w / 2, -d / 2) }, s)
      return
    }
    // The main run keeps a sofa's depth; the extension reaches the full listed depth.
    const d0 = Math.min(ctx.param('seatDepth'), d - 0.3)
    if (d0 < 0.5) {
      // Too shallow for an extension: draw a straight sofa rather than a broken one.
      seatRun(ctx, { L: w, D: d, armStart: true, armEnd: true, seats, transform: translate(-w / 2, -d / 2) }, s)
      return
    }
    if (shape === 'chaise-right' || shape === 'chaise-left') {
      const cw = Math.min(ctx.param('chaiseWidth'), w * 0.5)
      const mainSeats = Math.max(1, Math.round((w - cw - s.armW) / 0.72))
      if (shape === 'chaise-right') {
        seatRun(ctx, { L: w - cw, D: d0, armStart: true, armEnd: false, legsEnd: false, seats: mainSeats, transform: translate(-w / 2, -d / 2) }, s)
        seatRun(ctx, { L: cw, D: d, armStart: false, armEnd: true, seats: 1, transform: translate(w / 2 - cw, -d / 2) }, s)
      } else {
        seatRun(ctx, { L: cw, D: d, armStart: true, armEnd: false, seats: 1, transform: translate(-w / 2, -d / 2) }, s)
        seatRun(ctx, { L: w - cw, D: d0, armStart: false, armEnd: true, legsStart: false, seats: mainSeats, transform: translate(-w / 2 + cw, -d / 2) }, s)
      }
      return
    }
    // L: a main run along the back and a return run along one side, meeting at a corner seat.
    const returnSeats = Math.max(1, Math.round((d - d0 - s.armW) / 0.72))
    if (shape === 'L-right') {
      seatRun(ctx, { L: w - s.backD, D: d0, armStart: true, armEnd: false, legsEnd: false, seats, transform: translate(-w / 2, -d / 2) }, s)
      // Return: local x runs from the rear corner to the front; its back is the object's right side.
      seatRun(
        ctx,
        { L: d, D: d0, armStart: false, armEnd: true, seatFrom: d0, seats: returnSeats, transform: (g) => place(g, { ry: -Math.PI / 2, x: w / 2, z: -d / 2 }) },
        s,
      )
    } else {
      seatRun(ctx, { L: w - s.backD, D: d0, armStart: false, armEnd: true, legsStart: false, seats, transform: translate(-w / 2 + s.backD, -d / 2) }, s)
      // Mirror image: local x runs from the front to the rear corner along the left side.
      seatRun(
        ctx,
        { L: d, D: d0, armStart: true, armEnd: false, seatTo: d - d0, seats: returnSeats, transform: (g) => place(g, { ry: Math.PI / 2, x: -w / 2, z: d / 2 }) },
        s,
      )
    }
  },
})

export const chair = defineFamily({
  id: 'chair',
  label: 'Chair',
  blocks: {
    form: { options: ['armchair', 'ottoman', 'bench'], default: 'armchair' },
    shell: { options: ['boxy', 'barrel'], default: 'boxy' },
    arm: { options: ['track', 'rolled', 'slope', 'flared', 'none'], default: 'track' },
    back: { options: ['tight', 'pillow', 'channel'], default: 'tight' },
    top: { options: ['rect', 'round'], default: 'rect' },
    base: { options: ['tapered-legs', 'block-legs', 'metal-legs', 'plinth'], default: 'tapered-legs' },
  },
  params: {
    ...seatParams,
    armWidth: { min: 0.04, max: 0.3, default: 0.12 },
  },
  slots: {
    upholstery: { kind: 'fabric', color: '#c9bfae' },
    legs: { kind: 'wood', color: '#6b4a33' },
  },
  build(ctx) {
    suggestLegs(ctx)
    const form = ctx.block('form')
    if (form === 'ottoman' || form === 'bench') {
      ottomanOrBench(ctx, form)
      return
    }
    const s = seatSpec(ctx, 0.6)
    if (ctx.block('shell') === 'barrel') {
      barrel(ctx, s)
      return
    }
    seatRun(ctx, { L: ctx.w, D: ctx.d, armStart: true, armEnd: true, seats: 1, transform: translate(-ctx.w / 2, -ctx.d / 2) }, s)
  },
})

/** Ottoman (one upholstered block) or bench (a seat pad on a frame), on legs or a plinth. */
function ottomanOrBench(ctx: BuildContext, form: 'ottoman' | 'bench') {
  const { w, h, d } = ctx
  const base = ctx.block('base')
  const round = ctx.block('top') === 'round'
  const legH = Math.max(0, Math.min(ctx.param('legHeight'), h * 0.6))
  const pad = form === 'bench' ? Math.min(ctx.param('cushionThickness') * 0.6, (h - legH) * 0.6) : h - legH
  const padBottom = h - pad
  if (round) {
    const r = Math.min(w, d) / 2
    ctx.add('upholstery', place(puffDisc(r, pad, 0.03), { y: padBottom }))
  } else {
    ctx.add('upholstery', align(cushion(w, pad, d, Math.min(SOFT, pad / 3), 0.012), { cx: 0, y0: padBottom, cz: 0 }))
  }
  if (form === 'bench' && padBottom - legH > 0.01) {
    // Apron under the pad, in the legs' material.
    ctx.add('legs', slab(-w / 2 + 0.01, w / 2 - 0.01, Math.max(legH, padBottom - 0.06), padBottom, -d / 2 + 0.01, d / 2 - 0.01, 0.004))
  }
  if (legH <= 0.004) return
  if (base === 'plinth') {
    ctx.add('legs', round ? place(lathe([[0, 0], [Math.min(w, d) / 2 - 0.04, 0], [Math.min(w, d) / 2 - 0.04, legH], [0, legH]]), {}) : slab(-w / 2 + 0.03, w / 2 - 0.03, 0, legH, -d / 2 + 0.03, d / 2 - 0.03, 0.004))
    return
  }
  const style = LEG_STYLE[base] ?? 'tapered'
  const legTop = form === 'bench' ? Math.max(legH, padBottom - 0.06) : legH
  const spots = round
    ? [0, 1, 2, 3].map((i): [number, number] => {
        const a = Math.PI / 4 + (i * Math.PI) / 2
        const r = Math.min(w, d) / 2 - 0.06
        return [Math.cos(a) * r, Math.sin(a) * r]
      })
    : legGrid(-w / 2, w / 2, -d / 2, d / 2, style, 0.02)
  for (const [x, z] of spots) ctx.add('legs', leg(style, legTop, x, z))
}

/** A round cushion: flat bottom, rounded rim, gently domed top. */
function puffDisc(radius: number, height: number, crown: number): Geo {
  const rim = Math.min(0.035, height / 3, radius / 3)
  const body = height - crown
  const points: Array<[number, number]> = [[0, 0], [radius - rim, 0]]
  for (let i = 1; i <= 6; i++) {
    const a = -Math.PI / 2 + (i / 6) * Math.PI
    points.push([radius - rim + Math.cos(a) * rim, rim + Math.sin(a) * rim + (body - 2 * rim) * (i >= 3 ? 1 : 0)])
  }
  for (let i = 1; i <= 6; i++) {
    const f = i / 6
    points.push([(radius - rim) * (1 - f), body + crown * Math.sin((f * Math.PI) / 2)])
  }
  return lathe(points, 40)
}

/** Barrel chair: one curved shell wrapping the back and arms around a round seat. */
function barrel(ctx: BuildContext, s: SeatSpec) {
  const R = Math.min(ctx.w, ctx.d) / 2
  const cz = -ctx.d / 2 + R
  const t = Math.min(0.12, R * 0.3)
  const wrap = 0.35
  const shellH = ctx.h - s.legH
  const armH = Math.min(s.armH, ctx.h - 0.02) - s.legH
  // Tall back segment, and a lower band wrapping forward into the arms (3 mm smaller so they never share a surface).
  ctx.add('upholstery', place(arcBand(R, t, Math.PI / 2 - 1.0, Math.PI / 2 + 1.0, shellH, 0.03), { y: s.legH, z: cz }))
  ctx.add('upholstery', place(arcBand(R - 0.003, t - 0.006, -wrap, Math.PI + wrap, armH, 0.03), { y: s.legH, z: cz }))
  // Round seat inside the shell.
  const seatR = R - t + 0.01
  ctx.add('upholstery', place(puffDisc(seatR, s.seatH - s.legH, 0.02), { y: s.legH, z: cz }))
  if (s.legH <= 0.004) return
  if (s.base === 'plinth') {
    ctx.add('legs', place(lathe([[0, 0], [R - 0.05, 0], [R - 0.05, s.legH], [0, s.legH]]), { z: cz }))
    return
  }
  const style = LEG_STYLE[s.base] ?? 'tapered'
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2
    ctx.add('legs', leg(style, s.legH, Math.cos(a) * (R - 0.07), cz + Math.sin(a) * (R - 0.07)))
  }
}
