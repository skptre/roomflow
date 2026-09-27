/**
 * Decor: planters and plants, vases, rugs, wall art, mirrors, curtains,
 * pillows, throws. Art canvases and rug tops can show the product's photo.
 */
import { Path, Shape, Vector3 } from 'three'
import { defineFamily } from '../family'
import { cylinder, extrudeShape, lathe, pillowForm, place, slab, sphere, tube, type Geo } from '../kit'

/** Deterministic pseudo-random numbers (same plant every load). */
function random(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Outer profile of a pot, [radius fraction, height fraction] bottom → rim. */
const POTS: Record<string, Array<[number, number]>> = {
  cylinder: [[0.96, 0], [1, 0.03], [1, 1]],
  taper: [[0.72, 0], [0.76, 0.03], [1, 1]],
  bowl: [[0.5, 0], [0.56, 0.03], [0.9, 0.4], [1, 0.75], [0.98, 1]],
  footed: [[0.55, 0], [0.55, 0.12], [0.42, 0.18], [0.78, 0.45], [1, 1]],
}

/** A hollow vessel: outer profile, a lip, and an inner wall down to a floor (so the opening reads). */
function vessel(profile: Array<[number, number]>, R: number, H: number, wall: number, floorAt: number): Geo {
  const outer = profile.map(([r, y]): [number, number] => [r * R, y * H])
  const rim = outer[outer.length - 1]!
  const inner: Array<[number, number]> = [
    [Math.max(0.002, rim[0] - wall), H],
    [Math.max(0.002, rim[0] - wall * 1.2), Math.max(floorAt, H * 0.6)],
    [Math.max(0.002, rim[0] - wall * 1.5), floorAt],
    [0, floorAt],
  ]
  return lathe([[0, 0], ...outer, ...inner], 48)
}

export const planter = defineFamily({
  id: 'planter',
  label: 'Planter',
  blocks: {
    pot: { options: ['cylinder', 'taper', 'bowl', 'footed', 'square'], default: 'taper' },
    plant: { options: ['bush', 'fiddle', 'snake', 'palm', 'trailing', 'none'], default: 'bush' },
  },
  params: {
    potHeight: { min: 0.08, max: 1, default: (size, blocks) => (blocks.plant === 'none' ? size.height : Math.min(0.42, size.height * 0.34)) },
  },
  slots: {
    pot: { kind: 'ceramic', color: '#e9e4da' },
    soil: { kind: 'stone', color: '#4b3b2e' },
    plant: { kind: 'plant', color: '#5d7f4d' },
  },
  build(ctx) {
    const { w, h, d } = ctx
    const plant = ctx.block('plant')
    const reach = Math.min(w, d) / 2
    const potH = plant === 'none' ? h : Math.min(ctx.param('potHeight'), h * 0.7)
    const R = plant === 'none' ? reach : Math.min(reach, Math.max(potH * 0.55, reach * 0.5))
    const pot = ctx.block('pot')
    const soilY = potH - Math.min(0.03, potH * 0.12)
    if (pot === 'square') {
      const s = R * 0.92
      ctx.add('pot', slab(-s, s, 0, potH, -s, s, 0.008))
      if (plant !== 'none') ctx.add('soil', slab(-s + 0.012, s - 0.012, soilY - 0.01, soilY + 0.002, -s + 0.012, s - 0.012, 0.002))
    } else {
      ctx.add('pot', vessel(POTS[pot]!, R, potH, Math.min(0.012, R * 0.1), plant === 'none' ? potH * 0.1 : soilY - 0.02))
      const rim = POTS[pot]![POTS[pot]!.length - 1]![0] * R
      if (plant !== 'none') ctx.add('soil', place(cylinder(rim - 0.012, rim - 0.012, 0.01, 32), { y: soilY - 0.005 }))
    }
    if (plant === 'none') return

    const rand = random(7)
    const top = h
    const base = soilY
    const span = top - base
    const spread = reach
    const add = (g: Geo) => ctx.add('plant', g)
    switch (plant) {
      case 'bush': {
        // Overlapping foliage clusters filling an ellipsoid above the soil.
        const r = Math.min(spread * 0.42, span * 0.3)
        const ax = Math.max(0.001, spread - r)
        const ay = Math.max(0.001, span / 2 - r)
        const cy = base + span / 2
        const count = 14
        for (let i = 0; i < count; i++) {
          // Golden-angle spiral over the ellipsoid, pulled inward a little.
          const f = (i + 0.5) / count
          const y = 1 - 2 * f
          const ring = Math.sqrt(1 - y * y) * (0.55 + rand() * 0.35)
          const a = i * 2.39996
          const size = r * (0.8 + rand() * 0.3)
          const py = Math.max(base + size * 0.8, Math.min(top - size * 0.85, cy + y * ay * 0.9))
          add(place(sphere(size, size * 0.85, size, 16, 12), { x: Math.cos(a) * ring * ax, y: py, z: Math.sin(a) * ring * ax }))
        }
        break
      }
      case 'fiddle': {
        // A trunk with broad, upward-facing leaves.
        add(tube([new Vector3(0, base - 0.01, 0), new Vector3(0.01, base + span * 0.5, 0), new Vector3(-0.005, top - span * 0.12, 0)], 0.012, 8))
        const leaves = 14
        for (let i = 0; i < leaves; i++) {
          const f = 0.25 + (i / leaves) * 0.7
          const a = i * 2.4
          const len = Math.min(spread * 0.5, span * 0.16) * (1.1 - f * 0.3)
          const leaf = place(sphere(len * 0.62, len, 0.012, 14, 10), { rx: -0.9, ry: a })
          const out = len * 0.75
          add(place(leaf, { x: Math.cos(a) * out * 0.9, y: Math.min(base + f * span, top - len), z: -Math.sin(a) * out * 0.9 }))
        }
        break
      }
      case 'snake': {
        const blades = 9
        for (let i = 0; i < blades; i++) {
          const a = (i / blades) * Math.PI * 2 + rand()
          const bladeH = span * (0.6 + rand() * 0.4)
          const lean = 0.08 + rand() * 0.12
          const blade = place(cylinder(0.001, 0.035, bladeH, 10).scale(1, 1, 0.35), { rx: lean, ry: a })
          const r = Math.min(spread, 0.1) * 0.5
          add(place(blade, { x: Math.cos(a) * r, y: base + bladeH / 2 * Math.cos(lean), z: -Math.sin(a) * r }))
        }
        break
      }
      case 'palm': {
        // Arching fronds with paired leaflets along their outer half.
        const fronds = 7
        for (let i = 0; i < fronds; i++) {
          const a = (i / fronds) * Math.PI * 2 + rand() * 0.4
          const tipR = spread * (0.75 + rand() * 0.2) - 0.03
          const peak = base + span * (0.72 + rand() * 0.26)
          const dir = new Vector3(Math.cos(a), 0, -Math.sin(a))
          const side = new Vector3(Math.sin(a), 0, Math.cos(a))
          const start = new Vector3(0, base, 0)
          const mid = dir.clone().multiplyScalar(tipR * 0.4).setY(peak)
          const tip = dir.clone().multiplyScalar(tipR).setY(Math.max(base + span * 0.4, peak - span * 0.28))
          add(tube([start, mid, tip], 0.004, 6, 0.08))
          const leaflet = Math.min(0.09, tipR * 0.3)
          for (let j = 0; j < 7; j++) {
            const t = 0.35 + (j / 6) * 0.6
            // Point on the frond (quadratic through start, mid, tip).
            const p = start.clone().multiplyScalar((1 - t) ** 2).add(mid.clone().multiplyScalar(2 * t * (1 - t))).add(tip.clone().multiplyScalar(t * t))
            const size = leaflet * (1 - Math.abs(t - 0.6))
            for (const s of [-1, 1]) {
              const at = p.clone().add(side.clone().multiplyScalar((s * size) / 2)).setY(p.y - size * 0.25)
              add(place(sphere(size / 2, 0.004, 0.012, 10, 6), { rz: s * 0.45, ry: a - Math.PI / 2, x: at.x, y: at.y, z: at.z }))
            }
          }
        }
        break
      }
      case 'trailing': {
        const mound = Math.min(spread * 0.45, span * 0.4)
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2
          add(place(sphere(mound * 0.55, mound * 0.45, mound * 0.55, 14, 10), { x: Math.cos(a) * mound * 0.5, y: base + mound * 0.45, z: Math.sin(a) * mound * 0.5 }))
        }
        // Vines spilling over the rim toward the floor.
        const vines = 7
        for (let i = 0; i < vines; i++) {
          const a = (i / vines) * Math.PI * 2 + rand() * 0.3
          const edge = Math.min(R + 0.03, spread - 0.02)
          const drop = Math.max(0.02, potH * (0.4 + rand() * 0.5))
          for (let j = 0; j < 5; j++) {
            const y = base + 0.02 - (j / 4) * drop
            add(place(sphere(0.022, 0.02, 0.022, 10, 8), { x: Math.cos(a) * edge, y: Math.max(0.03, y), z: Math.sin(a) * edge }))
          }
        }
        break
      }
    }
  },
})

const VASES: Record<string, Array<[number, number]>> = {
  bud: [[0.5, 0], [0.55, 0.03], [1, 0.35], [0.85, 0.6], [0.28, 0.82], [0.26, 0.95], [0.34, 1]],
  amphora: [[0.55, 0], [0.6, 0.04], [1, 0.45], [0.8, 0.72], [0.45, 0.86], [0.5, 1]],
  cylinder: [[0.97, 0], [1, 0.02], [1, 1]],
  bowl: [[0.45, 0], [0.5, 0.05], [0.9, 0.45], [1, 1]],
  bottle: [[0.9, 0], [1, 0.05], [1, 0.55], [0.55, 0.72], [0.28, 0.8], [0.26, 1]],
  sphere: [[0.4, 0], [0.8, 0.12], [1, 0.45], [0.85, 0.78], [0.4, 0.95], [0.38, 1]],
}

export const vase = defineFamily({
  id: 'vase',
  label: 'Vase',
  blocks: { profile: { options: ['bud', 'amphora', 'cylinder', 'bowl', 'bottle', 'sphere', 'tray', 'round-tray'], default: 'amphora' } },
  params: {},
  slots: { body: { kind: 'ceramic', color: '#d9cdb8' } },
  build(ctx) {
    const profile = ctx.block('profile')
    if (profile === 'round-tray') {
      // A round tray: a disc floor and a low rim, as wide as the box's shorter side.
      const R = Math.min(ctx.w, ctx.d) / 2
      // Lower than the square tray's rim: a round rim as tall reads as a bowl.
      const H = Math.min(ctx.h, 0.06, R * 0.35)
      const wall = Math.min(0.008, R * 0.12)
      const floor = Math.min(0.01, H * 0.4)
      ctx.add('body', lathe([[0, 0], [R * 0.97, 0], [R, H * 0.2], [R, H], [R - wall, H], [R - wall, floor], [0, floor]], 64))
      return
    }
    if (profile === 'tray') {
      // A shallow tray: floor and a low rim, as wide and deep as the box.
      const H = Math.min(ctx.h, 0.06, Math.min(ctx.w, ctx.d) * 0.3)
      const wall = Math.min(0.008, Math.min(ctx.w, ctx.d) * 0.06)
      const x = ctx.w / 2
      const z = ctx.d / 2
      ctx.add('body', slab(-x, x, 0, Math.min(0.01, H * 0.4), -z, z, 0.002))
      ctx.add('body', slab(-x, x, 0, H, z - wall, z, 0.002))
      ctx.add('body', slab(-x, x, 0, H, -z, -z + wall, 0.002))
      ctx.add('body', slab(-x, -x + wall, 0, H, -z, z, 0.002))
      ctx.add('body', slab(x - wall, x, 0, H, -z, z, 0.002))
      return
    }
    const R = Math.min(ctx.w, ctx.d) / 2
    // Bowls and spheres keep their own proportions when the box is taller (often an estimated size).
    const H = profile === 'bowl' ? Math.min(ctx.h, R) : profile === 'sphere' ? Math.min(ctx.h, R * 2.1) : ctx.h
    ctx.add('body', vessel(VASES[profile]!, R, H, Math.min(0.006, R * 0.1), H * 0.08))
  },
})

export const rug = defineFamily({
  id: 'rug',
  label: 'Rug',
  blocks: {
    shape: { options: ['rect', 'round'], default: 'rect' },
    edge: { options: ['none', 'fringe'], default: 'none' },
  },
  params: {},
  slots: {
    top: { kind: 'fabric', color: '#d8cdbb' },
    fringe: { kind: 'fabric', color: '#efe8da' },
  },
  imageSlot: 'top',
  imageProjection: 'xz',
  build(ctx) {
    const { w, h, d } = ctx
    const t = Math.max(0.004, h)
    if (ctx.block('shape') === 'round') {
      // A round rug is a circle (a round size lists one diameter; an estimated box may not be square).
      const r = Math.min(w, d) / 2
      const shape = new Shape().absellipse(0, 0, r, r, 0, Math.PI * 2, false, 0)
      ctx.add('top', extrudeShape(shape, t, Math.min(0.003, t / 3), 64).rotateX(-Math.PI / 2))
      return
    }
    const fringe = ctx.block('edge') === 'fringe' ? Math.min(0.06, w * 0.05) : 0
    ctx.add('top', slab(-w / 2 + fringe, w / 2 - fringe, 0, t, -d / 2, d / 2, Math.min(0.003, t / 3)))
    if (fringe > 0) {
      // Tassels along the two short ends.
      const count = Math.max(8, Math.round(d / 0.03))
      for (const sign of [-1, 1]) {
        for (let i = 0; i < count; i++) {
          const z = -d / 2 + ((i + 0.5) / count) * d
          const x0 = sign < 0 ? -w / 2 : w / 2 - fringe - 0.002
          ctx.add('fringe', slab(x0, x0 + fringe + 0.002, 0, Math.min(t, 0.004), z - 0.004, z + 0.004, 0.0015))
        }
      }
    }
  },
})

export const art = defineFamily({
  id: 'art',
  label: 'Wall art',
  blocks: {
    frame: { options: ['thin', 'wide', 'float', 'none'], default: 'thin' },
    mat: { options: ['none', 'white'], default: 'none' },
  },
  params: {},
  slots: {
    frame: { kind: 'wood', color: '#2e2a26' },
    mat: { kind: 'paper', color: '#f5f2eb' },
    canvas: { kind: 'paper', color: '#d9d2c4' },
  },
  imageSlot: 'canvas',
  imageProjection: 'xy',
  build(ctx) {
    const { w, h, d } = ctx
    const frame = ctx.block('frame')
    const back = -d / 2
    if (frame === 'none') {
      // Gallery-wrapped canvas: the print wraps the whole block.
      ctx.add('canvas', slab(-w / 2, w / 2, 0, h, back, d / 2, 0.002))
      return
    }
    const fw = Math.min(frame === 'wide' ? 0.055 : frame === 'float' ? 0.018 : 0.022, Math.min(w, h) * 0.15)
    // Frame: four moldings, mitred look via overlapping corners on the top/bottom pieces.
    ctx.add('frame', slab(-w / 2, w / 2, h - fw, h, back, d / 2, 0.003))
    ctx.add('frame', slab(-w / 2, w / 2, 0, fw, back, d / 2, 0.003))
    ctx.add('frame', slab(-w / 2, -w / 2 + fw, fw - 0.001, h - fw + 0.001, back, d / 2, 0.003))
    ctx.add('frame', slab(w / 2 - fw, w / 2, fw - 0.001, h - fw + 0.001, back, d / 2, 0.003))
    const ix0 = -w / 2 + fw
    const ix1 = w / 2 - fw
    const iy0 = fw
    const iy1 = h - fw
    const face = d / 2 - Math.min(0.008, d * 0.3)
    ctx.add('mat', slab(ix0 + 0.0005, ix1 - 0.0005, iy0 + 0.0005, iy1 - 0.0005, back + 0.002, face - 0.004, 0.001))
    const margin = ctx.block('mat') === 'white' ? Math.min(ix1 - ix0, iy1 - iy0) * 0.12 : frame === 'float' ? 0.02 : 0
    ctx.add('canvas', slab(ix0 + margin, ix1 - margin, iy0 + margin, iy1 - margin, face - 0.004, face - (frame === 'float' ? 0 : 0.002), 0.0008))
  },
})

/** Mirror outline in the XY plane (x across, y up from 0 to h). */
function mirrorShape(kind: string, w: number, h: number, inset = 0): Shape | Path {
  const x0 = -w / 2 + inset
  const x1 = w / 2 - inset
  const y0 = inset
  const y1 = h - inset
  const shape = new Shape()
  switch (kind) {
    case 'round':
    case 'oval': {
      const rx = kind === 'round' ? Math.min(x1 - x0, y1 - y0) / 2 : (x1 - x0) / 2
      const ry = kind === 'round' ? rx : (y1 - y0) / 2
      shape.absellipse(0, h / 2, rx, ry, 0, Math.PI * 2, false, 0)
      return shape
    }
    case 'arch': {
      const r = (x1 - x0) / 2
      const spring = Math.max(y0 + 0.01, y1 - r)
      shape.moveTo(x0, y0).lineTo(x1, y0).lineTo(x1, spring)
      shape.absellipse(0, spring, r, y1 - spring, 0, Math.PI, false, 0)
      return shape.closePath()
    }
    default: {
      const r = Math.min(0.01, (x1 - x0) / 4)
      return shape
        .moveTo(x0 + r, y0)
        .lineTo(x1 - r, y0)
        .quadraticCurveTo(x1, y0, x1, y0 + r)
        .lineTo(x1, y1 - r)
        .quadraticCurveTo(x1, y1, x1 - r, y1)
        .lineTo(x0 + r, y1)
        .quadraticCurveTo(x0, y1, x0, y1 - r)
        .lineTo(x0, y0 + r)
        .quadraticCurveTo(x0, y0, x0 + r, y0)
        .closePath()
    }
  }
}

export const mirror = defineFamily({
  id: 'mirror',
  label: 'Mirror',
  blocks: {
    shape: { options: ['rect', 'arch', 'round', 'oval'], default: 'rect' },
    frame: { options: ['thin', 'wide', 'none'], default: 'thin' },
  },
  params: {},
  slots: {
    frame: { kind: 'metal', color: '#b08d57' },
    glass: { kind: 'mirror', color: '#e4e9ea' },
  },
  build(ctx) {
    const { w, h, d } = ctx
    const kind = ctx.block('shape')
    const frame = ctx.block('frame')
    const fw = frame === 'none' ? 0 : Math.min(frame === 'wide' ? 0.06 : 0.018, Math.min(w, h) * 0.12)
    const back = -d / 2
    if (fw > 0) {
      const outline = mirrorShape(kind, w, h) as Shape
      const hole = new Path(mirrorShape(kind, w, h, fw).getPoints(64))
      outline.holes.push(hole)
      ctx.add('frame', place(extrudeShape(outline, d, Math.min(0.004, d / 3), 64), { z: back }))
    }
    const glassDepth = Math.max(0.004, d * (fw > 0 ? 0.6 : 1))
    ctx.add('glass', place(extrudeShape(mirrorShape(kind, w, h, Math.max(0, fw - 0.002)) as Shape, glassDepth, 0.0015, 64), { z: back }))
  },
})

/** A pleated band of fabric from xa to xb: a sine wave across, extruded down from `top` to just above the floor. */
function pleats(xa: number, xb: number, pleat: number, amplitude: number, top: number): Geo {
  const waves = Math.max(2, Math.round((xb - xa) / pleat))
  const thickness = 0.004
  const steps = waves * 12
  const front: Vector3[] = []
  for (let i = 0; i <= steps; i++) {
    const x = xa + ((xb - xa) * i) / steps
    front.push(new Vector3(x, Math.sin((i / steps) * waves * Math.PI * 2) * (amplitude - thickness / 2), 0))
  }
  const shape = new Shape()
  shape.moveTo(front[0]!.x, front[0]!.y + thickness / 2)
  for (const p of front) shape.lineTo(p.x, p.y + thickness / 2)
  for (const p of [...front].reverse()) shape.lineTo(p.x, p.y - thickness / 2)
  shape.closePath()
  // Shape XY → XZ (y → −z), extruded up from the hem.
  return place(extrudeShape(shape, top - 0.01, 0, 1).rotateX(-Math.PI / 2), { y: 0.01 })
}

export const curtain = defineFamily({
  id: 'curtain',
  label: 'Curtain',
  blocks: {
    rod: { options: ['metal', 'wood', 'none'], default: 'metal' },
    // How it hangs, not what it is: open (gathered at both ends, the window showing between) or drawn closed.
    draw: { options: ['open', 'closed'], default: 'open' },
  },
  params: { fullness: { min: 0.5, max: 2, default: 1 } },
  slots: {
    fabric: { kind: 'fabric', color: '#e8e1d4' },
    rod: { kind: 'metal', color: '#2b2b2c' },
  },
  build(ctx) {
    const { w, h, d } = ctx
    const rod = ctx.block('rod')
    if (rod === 'wood') ctx.suggest('rod', 'wood', '#8b6a4c')
    const rodR = 0.012
    const top = rod === 'none' ? h : h - 2 * rodR - 0.015
    const amplitude = Math.max(0.004, Math.min(d / 2 - 0.004, 0.035))
    const pleat = 0.13 / ctx.param('fullness')
    const x0 = -w / 2 + 0.005
    const x1 = w / 2 - 0.005
    if (ctx.block('draw') === 'closed') {
      ctx.add('fabric', pleats(x0, x1, pleat, amplitude, top))
    } else {
      // Drawn open: the fabric gathers into a deeper, tighter stack at each end.
      const stack = Math.max(0.12, Math.min(w * 0.28, 0.6))
      ctx.add('fabric', pleats(x0, x0 + stack, pleat * 0.55, Math.max(0.004, d / 2 - 0.004), top))
      ctx.add('fabric', pleats(x1 - stack, x1, pleat * 0.55, Math.max(0.004, d / 2 - 0.004), top))
    }
    if (rod === 'none') return
    ctx.add('rod', place(cylinder(rodR, rodR, w - 0.05, 16), { rz: Math.PI / 2, y: h - rodR - 0.004 }))
    for (const sign of [-1, 1]) ctx.add('rod', place(sphere(0.02, 0.02, 0.02, 14, 10), { x: sign * (w / 2 - 0.021), y: h - 0.021 }))
    // Rings holding the heading, where there is fabric.
    const rings = Math.max(3, Math.round(w / 0.15))
    for (let i = 0; i < rings; i++) {
      const x = x0 + 0.02 + ((x1 - x0 - 0.04) * i) / (rings - 1)
      if (ctx.block('draw') !== 'closed' && Math.abs(x) < w / 2 - Math.max(0.12, Math.min(w * 0.28, 0.6))) continue
      ctx.add('rod', place(cylinder(0.006, 0.006, top < h ? h - rodR - top + 0.004 : 0.01, 8), { x, y: (h - rodR + top) / 2 }))
    }
  },
})

export const pillow = defineFamily({
  id: 'pillow',
  label: 'Pillow',
  blocks: { shape: { options: ['square', 'round'], default: 'square' } },
  params: {},
  slots: { fabric: { kind: 'fabric', color: '#d8c7a9' } },
  build(ctx) {
    const round = ctx.block('shape') === 'round'
    ctx.add('fabric', place(pillowForm(ctx.w, ctx.h, ctx.d, round ? 'round' : 'square'), { y: ctx.h / 2 }))
  },
})

export const throwBlanket = defineFamily({
  id: 'throw',
  label: 'Throw',
  blocks: { fold: { options: ['folded', 'rolled'], default: 'folded' } },
  params: {},
  slots: { fabric: { kind: 'fabric', color: '#c9b79c' } },
  build(ctx) {
    const { w, h, d } = ctx
    if (ctx.block('fold') === 'rolled') {
      const r = Math.min(h, d) / 2
      ctx.add('fabric', slab(-w / 2, w / 2, 0, 2 * r, -r, r, r - 1e-4))
      return
    }
    // Three soft layers, the fold toward the front.
    const layers = 3
    const lh = h / layers
    for (let i = 0; i < layers; i++) {
      const inset = i * 0.006
      ctx.add('fabric', slab(-w / 2 + inset, w / 2 - inset, i * lh, (i + 1) * lh - 0.001, -d / 2 + inset, d / 2 - inset * 0.5, Math.min(lh / 2 - 1e-4, 0.02)))
    }
  },
})

