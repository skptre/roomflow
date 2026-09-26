/**
 * Floor-plan geometry on the XZ plane. Conventions are documented in ./units.ts:
 * yaw turns local +X toward -Z, origin is the bottom-center of the footprint,
 * width runs along local X and depth along local Z.
 */
import type { Dimensions, Vec2 } from './schema'
import type { Pose } from './units'

/** Anything with a pose and a footprint size. */
export type Placed = { pose: Pose; dimensions: Pick<Dimensions, 'width' | 'depth'> }

/** Items this low (rugs, mats) lie on the floor: furniture may stand on them without overlapping. */
export const FLOOR_COVERING_MAX_HEIGHT = 0.03

export function blocksFloor(object: { dimensions: Pick<Dimensions, 'height'> }): boolean {
  return object.dimensions.height > FLOOR_COVERING_MAX_HEIGHT
}

export type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number }

/** Tolerance in meters: touching within this distance is not overlap or escape. */
const EPS = 1e-6

/** The four footprint corners on the floor, counter-clockwise in local space. */
export function footprint({ pose, dimensions }: Placed): Vec2[] {
  const hw = dimensions.width / 2
  const hd = dimensions.depth / 2
  const c = Math.cos(pose.yaw)
  const s = Math.sin(pose.yaw)
  const local: Array<[number, number]> = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ]
  // Rotation about +Y: x' = x cos + z sin, z' = -x sin + z cos.
  return local.map(([x, z]) => ({
    x: pose.position.x + x * c + z * s,
    z: pose.position.z - x * s + z * c,
  }))
}

export function footprintBounds(points: readonly Vec2[]): Bounds {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minZ = Math.min(minZ, p.z)
    maxZ = Math.max(maxZ, p.z)
  }
  return { minX, maxX, minZ, maxZ }
}

function edgeNormals(points: readonly Vec2[]): Vec2[] {
  return points.map((p, i) => {
    const q = points[(i + 1) % points.length]!
    return { x: -(q.z - p.z), z: q.x - p.x }
  })
}

function project(points: readonly Vec2[], axis: Vec2): [number, number] {
  let min = Infinity
  let max = -Infinity
  for (const p of points) {
    const d = p.x * axis.x + p.z * axis.z
    min = Math.min(min, d)
    max = Math.max(max, d)
  }
  return [min, max]
}

/**
 * True when two footprints share interior area (separating axis test on the
 * rotated rectangles). Touching edges or corners do not count as overlap.
 */
export function footprintsOverlap(a: Placed, b: Placed): boolean {
  const pa = footprint(a)
  const pb = footprint(b)
  for (const axis of [...edgeNormals(pa), ...edgeNormals(pb)]) {
    const length = Math.hypot(axis.x, axis.z)
    if (length === 0) continue
    const unit = { x: axis.x / length, z: axis.z / length }
    const [minA, maxA] = project(pa, unit)
    const [minB, maxB] = project(pb, unit)
    if (maxA <= minB + EPS || maxB <= minA + EPS) return false
  }
  return true
}

function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const lengthSq = dx * dx + dz * dz
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / lengthSq))
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz))
}

/** Point-in-polygon with the boundary counted as inside. */
export function pointInPolygon(p: Vec2, polygon: readonly Vec2[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!
    const b = polygon[j]!
    if (distanceToSegment(p, a, b) <= EPS) return true
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) {
      inside = !inside
    }
  }
  return inside
}

function orientation(a: Vec2, b: Vec2, c: Vec2): number {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)
}

/** True when the segments cross at a single interior point (touching or collinear does not count). */
function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const o1 = orientation(a, b, c)
  const o2 = orientation(a, b, d)
  const o3 = orientation(c, d, a)
  const o4 = orientation(c, d, b)
  return ((o1 > EPS && o2 < -EPS) || (o1 < -EPS && o2 > EPS)) && ((o3 > EPS && o4 < -EPS) || (o3 < -EPS && o4 > EPS))
}

/** Strict interior test for a convex polygon (the footprint), either winding. */
function strictlyInsideConvex(p: Vec2, convex: readonly Vec2[]): boolean {
  let sign = 0
  for (let i = 0; i < convex.length; i++) {
    const o = orientation(convex[i]!, convex[(i + 1) % convex.length]!, p)
    if (Math.abs(o) <= EPS) return false
    const s = Math.sign(o)
    if (sign === 0) sign = s
    else if (s !== sign) return false
  }
  return true
}

/**
 * True when the whole footprint lies within the floor polygon (touching walls is
 * allowed). Works for concave rooms: corners must be inside, no room edge may
 * cut through the footprint, and no room corner may poke into it.
 */
export function insideRoom(object: Placed, floorPolygon: readonly Vec2[]): boolean {
  const corners = footprint(object)
  if (!corners.every((corner) => pointInPolygon(corner, floorPolygon))) return false
  for (let i = 0; i < floorPolygon.length; i++) {
    const a = floorPolygon[i]!
    const b = floorPolygon[(i + 1) % floorPolygon.length]!
    if (strictlyInsideConvex(a, corners)) return false
    for (let k = 0; k < corners.length; k++) {
      if (segmentsCross(a, b, corners[k]!, corners[(k + 1) % corners.length]!)) return false
    }
  }
  return true
}

function withPosition(pose: Pose, x: number, z: number): Pose {
  return { position: { x, y: pose.position.y, z }, yaw: pose.yaw }
}

/**
 * Translate an object the shortest practical distance so its footprint is inside
 * the room. Yaw and size never change. Returns null when it cannot fit at this yaw.
 */
export function clampIntoRoom(object: Placed, floorPolygon: readonly Vec2[]): Pose | null {
  if (insideRoom(object, floorPolygon)) return object.pose

  const fit = (pose: Pose) => insideRoom({ pose, dimensions: object.dimensions }, floorPolygon)

  // 1. Push back inside along X and Z independently (exact for axis-aligned rooms).
  const box = footprintBounds(footprint(object))
  const room = footprintBounds(floorPolygon)
  if (box.maxX - box.minX > room.maxX - room.minX + EPS || box.maxZ - box.minZ > room.maxZ - room.minZ + EPS) {
    return null
  }
  const dx = box.minX < room.minX ? room.minX - box.minX : box.maxX > room.maxX ? room.maxX - box.maxX : 0
  const dz = box.minZ < room.minZ ? room.minZ - box.minZ : box.maxZ > room.maxZ ? room.maxZ - box.maxZ : 0
  const pushed = withPosition(object.pose, object.pose.position.x + dx, object.pose.position.z + dz)
  if (fit(pushed)) return pushed

  // 2. Irregular rooms: test a grid of positions over the room and keep the nearest fit.
  const span = Math.max(room.maxX - room.minX, room.maxZ - room.minZ)
  const step = Math.max(0.02, span / 200)
  const candidates: Array<{ x: number; z: number; d: number }> = []
  for (let x = room.minX; x <= room.maxX + EPS; x += step) {
    for (let z = room.minZ; z <= room.maxZ + EPS; z += step) {
      candidates.push({ x, z, d: Math.hypot(x - object.pose.position.x, z - object.pose.position.z) })
    }
  }
  candidates.sort((a, b) => a.d - b.d)
  for (const candidate of candidates) {
    const pose = withPosition(object.pose, candidate.x, candidate.z)
    if (fit(pose)) return pose
  }
  return null
}
