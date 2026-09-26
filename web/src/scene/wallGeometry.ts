/**
 * Wall faces with openings cut out. Works in a wall's own 2D profile space:
 * u runs along the wall from its start (meters), v runs up from the floor.
 * Openings are subtracted with polygon-clipping, so doors touching the floor
 * become notches (never a sliver of wall across the doorway), windows become
 * holes, and overlapping openings merge.
 */
import polygonClipping, { type Pair, type Polygon } from 'polygon-clipping'
import { Path, Shape } from 'three'
import type { Opening, Wall } from '../domain/schema'

/** RoomPlan walls are zero-depth; draw them this thick so faces don't z-fight. */
export const DEFAULT_WALL_THICKNESS = 0.12
const MIN_SCANNED_THICKNESS = 0.02
/** Openings this close to the floor or top are extended past it so no sliver remains. */
const EDGE_SNAP = 0.01
const OVERSHOOT = 0.05

/** One solid region of the profile: [outer ring, ...hole rings], each ring closed. */
export type ProfilePolygon = Pair[][]

export type ProfileOptions = {
  /** Extend the solid wall past both ends (e.g. to close exterior corners). */
  extend?: number
  /** Cut the wall down to this height (cutaway stub). */
  maxHeight?: number
}

export function wallThickness(wall: Wall): number {
  return wall.thickness >= MIN_SCANNED_THICKNESS ? wall.thickness : DEFAULT_WALL_THICKNESS
}

export function wallLength(wall: Wall): number {
  return Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z)
}

function rect(u0: number, v0: number, u1: number, v1: number): Polygon {
  return [
    [
      [u0, v0],
      [u1, v0],
      [u1, v1],
      [u0, v1],
      [u0, v0],
    ],
  ]
}

export function wallProfile(wall: Wall, openings: readonly Opening[], options: ProfileOptions = {}): ProfilePolygon[] {
  const length = wallLength(wall)
  const extend = options.extend ?? 0
  const height = Math.min(wall.height, options.maxHeight ?? wall.height)
  const solid = rect(-extend, 0, length + extend, height)

  const cuts: Polygon[] = []
  for (const opening of openings) {
    if (opening.wallId !== wall.id) continue
    // Clip to the wall's own length so an opening never eats into the corner extension.
    const u0 = Math.max(0, opening.offsetAlongWall - opening.width / 2)
    const u1 = Math.min(length, opening.offsetAlongWall + opening.width / 2)
    if (u1 <= u0) continue
    const top = opening.bottom + opening.height
    const v0 = opening.bottom <= EDGE_SNAP ? -OVERSHOOT : opening.bottom
    const v1 = top >= height - EDGE_SNAP ? height + OVERSHOOT : top
    if (v1 <= v0 || v0 >= height) continue
    cuts.push(rect(u0, v0, u1, v1))
  }

  if (cuts.length === 0) return [solid as ProfilePolygon]
  return polygonClipping.difference(solid, ...cuts) as ProfilePolygon[]
}

function ringPoints(ring: readonly Pair[]): Pair[] {
  // polygon-clipping closes rings by repeating the first point; three.js shapes do not.
  const last = ring[ring.length - 1]
  const first = ring[0]
  const closed = first && last && first[0] === last[0] && first[1] === last[1]
  return closed ? ring.slice(0, -1) : ring.slice()
}

/** Profile polygons as three.js shapes in the (u, v) plane, ready for extrusion. */
export function wallShapes(polygons: readonly ProfilePolygon[]): Shape[] {
  return polygons.map(([outer, ...holes]) => {
    const shape = new Shape()
    ringPoints(outer!).forEach(([u, v], i) => (i === 0 ? shape.moveTo(u, v) : shape.lineTo(u, v)))
    shape.closePath()
    for (const ring of holes) {
      const path = new Path()
      ringPoints(ring).forEach(([u, v], i) => (i === 0 ? path.moveTo(u, v) : path.lineTo(u, v)))
      path.closePath()
      shape.holes.push(path)
    }
    return shape
  })
}
