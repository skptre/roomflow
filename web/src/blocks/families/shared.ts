/**
 * Shared leaves used across families — one leg set, one handle set, one edge
 * vocabulary — so every piece in the app reads as the same design language.
 * Real-size details (leg radius, handle size) never stretch with the object.
 */
import { Vector3 } from 'three'
import { cylinder, lathe, place, slab, sphere, tube, type Geo } from '../kit'

/** Edge radius for hard materials (wood, metal, stone): a crisp 4 mm. */
export const HARD = 0.004
/** Edge radius for upholstery. */
export const SOFT = 0.035
/** Gap between neighboring cushions or drawer fronts. */
export const GAP = 0.008

export type LegStyle = 'tapered' | 'straight' | 'block' | 'metal' | 'turned' | 'hairpin'

/** Half the footprint a leg needs (for insetting it inside the box). */
export function legHalfWidth(style: LegStyle): number {
  switch (style) {
    case 'tapered':
    case 'turned':
      return 0.022
    case 'straight':
      return 0.02
    case 'block':
      return 0.025
    case 'metal':
      return 0.01
    case 'hairpin':
      return 0.045
  }
}

/** One leg standing on the floor at (x, z), `height` tall. */
export function leg(style: LegStyle, height: number, x: number, z: number): Geo {
  const h = Math.max(0.005, height)
  switch (style) {
    case 'tapered':
      return place(cylinder(0.02, 0.013, h, 18), { x, y: h / 2, z })
    case 'straight':
      return place(cylinder(0.02, 0.02, h, 18), { x, y: h / 2, z })
    case 'block':
      return slab(x - 0.025, x + 0.025, 0, h, z - 0.025, z + 0.025, HARD)
    case 'metal':
      return place(cylinder(0.009, 0.009, h, 12), { x, y: h / 2, z })
    case 'turned': {
      // A classic spindle: foot, slim neck, a bead, long taper to the top.
      const t = (f: number) => f * h
      return place(
        lathe([
          [0, 0],
          [0.014, 0],
          [0.016, t(0.04)],
          [0.011, t(0.12)],
          [0.018, t(0.22)],
          [0.012, t(0.3)],
          [0.016, t(0.75)],
          [0.021, t(0.9)],
          [0.021, h],
          [0, h],
        ], 20),
        { x, z },
      )
    }
    case 'hairpin': {
      // Two rods meeting at the foot, splayed 8 cm apart under the top.
      const r = 0.005
      return tube([new Vector3(x - 0.04, h - r, z), new Vector3(x - 0.004, r + 0.004, z), new Vector3(x + 0.004, r + 0.004, z), new Vector3(x + 0.04, h - r, z)], r, 8)
    }
  }
}

/**
 * Leg positions for a rectangular footprint [x0,x1] × [z0,z1], inset so the
 * legs stay inside it; a middle pair is added under long spans.
 */
export function legGrid(x0: number, x1: number, z0: number, z1: number, style: LegStyle, inset = 0.04): Array<[number, number]> {
  const half = legHalfWidth(style)
  const ix = Math.min(inset + half, (x1 - x0) / 2)
  const iz = Math.min(inset + half, (z1 - z0) / 2)
  const xs = [x0 + ix, x1 - ix]
  if (x1 - x0 > 2.2) xs.splice(1, 0, (x0 + x1) / 2)
  const zs = [z0 + iz, z1 - iz]
  return xs.flatMap((x) => zs.map((z): [number, number] => [x, z]))
}

export type HandleStyle = 'knob' | 'bar' | 'edge' | 'none'

/** A pull on a front whose face is at z = `face`, centered at (x, y). Vertical bars suit tall doors. */
export function handle(style: HandleStyle, x: number, y: number, face: number, vertical = false, length = 0.12): Geo | null {
  switch (style) {
    case 'knob':
      return place(sphere(0.013, 0.013, 0.011, 14, 10), { x, y, z: face + 0.012 })
    case 'bar': {
      const half = length / 2
      const a = vertical ? new Vector3(x, y - half, face + 0.022) : new Vector3(x - half, y, face + 0.022)
      const b = vertical ? new Vector3(x, y + half, face + 0.022) : new Vector3(x + half, y, face + 0.022)
      const posts = vertical
        ? [new Vector3(x, y - half, face), a, b, new Vector3(x, y + half, face)]
        : [new Vector3(x - half, y, face), a, b, new Vector3(x + half, y, face)]
      return tube(posts, 0.005, 8)
    }
    case 'edge':
      // A slim finger-pull lip along the top of the front.
      return vertical
        ? slab(x - 0.006, x + 0.006, y - length, y + length, face, face + 0.012, 0.003)
        : slab(x - length, x + length, y - 0.006, y + 0.006, face, face + 0.012, 0.003)
    case 'none':
      return null
  }
}
