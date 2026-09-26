/**
 * Placement helpers: find somewhere an item fits. Deterministic — the same room
 * and size always give the same answer.
 */
import { collisions } from './commands'
import { blocksFloor, footprint, footprintBounds, footprintsOverlap, insideRoom, pointInPolygon } from './geometry'
import type { Dimensions, Room, RoomObject, Vec2 } from './schema'
import type { Pose } from './units'

const STEP = 0.1

export type FreeSpotOptions = {
  /** Search outward from here (defaults to the middle of the room). */
  near?: Vec2
  /** Yaws to try at each spot, in order (defaults to 0 then 90°). */
  yaws?: number[]
  /** An object to ignore, e.g. the one being replaced. */
  ignoreId?: string
}

/**
 * The closest spot (on a 10 cm grid, nearest first) where a footprint of this
 * size is inside the room and overlaps nothing. Returns null when nothing fits.
 */
export function freeSpot(
  room: Room,
  size: Pick<Dimensions, 'width' | 'depth'> & { height?: number },
  options: FreeSpotOptions = {},
): Pose | null {
  const bounds = footprintBounds(room.floorPolygon)
  const near = options.near ?? { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 }
  const yaws = options.yaws ?? [0, Math.PI / 2]
  // A floor covering may go under furniture; everything else needs clear floor.
  const covering = size.height !== undefined && !blocksFloor({ dimensions: { height: size.height } })
  const others = covering
    ? []
    : room.objects.filter(
        (object) =>
          object.id !== options.ignoreId &&
          blocksFloor(object) &&
          // Something hung above the new item's full height doesn't take its floor space.
          (size.height === undefined || object.pose.position.y < size.height),
      )

  // Grid aligned to `near` so the requested point itself is a candidate.
  const candidates: Array<Vec2 & { d: number }> = []
  const startI = Math.floor((bounds.minX - near.x) / STEP)
  const endI = Math.ceil((bounds.maxX - near.x) / STEP)
  const startJ = Math.floor((bounds.minZ - near.z) / STEP)
  const endJ = Math.ceil((bounds.maxZ - near.z) / STEP)
  for (let i = startI; i <= endI; i++) {
    for (let j = startJ; j <= endJ; j++) {
      const x = near.x + i * STEP
      const z = near.z + j * STEP
      candidates.push({ x, z, d: Math.hypot(i, j) })
    }
  }
  candidates.sort((a, b) => a.d - b.d || a.x - b.x || a.z - b.z)

  for (const candidate of candidates) {
    for (const yaw of yaws) {
      const placed = { pose: { position: { x: candidate.x, y: 0, z: candidate.z }, yaw }, dimensions: size }
      if (!insideRoom(placed, room.floorPolygon)) continue
      if (others.some((other) => footprintsOverlap(placed, other))) continue
      return placed.pose
    }
  }
  return null
}

/** Rotate a local floor offset (x along width, z along depth) by yaw and add it to a position. */
function toWorld(origin: Vec2, yaw: number, local: Vec2): Vec2 {
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  return { x: origin.x + local.x * c + local.z * s, z: origin.z - local.x * s + local.z * c }
}

function placedAt(candidate: RoomObject, position: Vec2, yaw: number, y: number): RoomObject {
  return { ...candidate, pose: { position: { x: position.x, y, z: position.z }, yaw } }
}

/** Inside the room and not colliding with anything (height-aware). */
export function fitsAt(room: Room, candidate: RoomObject): boolean {
  return insideRoom(candidate, room.floorPolygon) && collisions(room, candidate).length === 0
}

/** Where along a wall to try hanging something, middle first. */
const WALL_STOPS = [0.5, 0.35, 0.65, 0.2, 0.8]
/** Clearance from wall ends, and between the object's back and the wall surface. */
const WALL_MARGIN = 0.05
const WALL_GAP = 0.002

/**
 * Against a wall, facing into the room, with its bottom at `mountHeight`
 * (1.2 m for art; 0 for a floor mirror leaning on the wall). Skips interior
 * partitions, wall ends, and anything that would cover a door or window.
 */
export function wallSpot(room: Room, candidate: RoomObject, mountHeight: number): RoomObject | null {
  const { width, height, depth } = candidate.dimensions
  for (const wall of [...room.walls].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!wall.exterior) continue
    const dx = wall.end.x - wall.start.x
    const dz = wall.end.z - wall.start.z
    const length = Math.hypot(dx, dz)
    if (length < width + 2 * WALL_MARGIN) continue
    const dir = { x: dx / length, z: dz / length }
    // Inward normal: the side of the wall the floor is on.
    const left = { x: -dir.z, z: dir.x }
    const mid = { x: wall.start.x + dx / 2, z: wall.start.z + dz / 2 }
    const inward = pointInPolygon({ x: mid.x + left.x * 0.05, z: mid.z + left.z * 0.05 }, room.floorPolygon) ? left : { x: -left.x, z: -left.z }
    const y = Math.min(mountHeight, wall.height - height - WALL_MARGIN)
    if (y < 0) continue
    for (const stop of WALL_STOPS) {
      const u = stop * length
      if (u - width / 2 < WALL_MARGIN || u + width / 2 > length - WALL_MARGIN) continue
      const blocked = room.openings.some(
        (opening) =>
          opening.wallId === wall.id &&
          Math.abs(u - opening.offsetAlongWall) < (opening.width + width) / 2 &&
          y < opening.bottom + opening.height &&
          opening.bottom < y + height,
      )
      if (blocked) continue
      const position = {
        x: wall.start.x + dir.x * u + inward.x * (depth / 2 + WALL_GAP),
        z: wall.start.z + dir.z * u + inward.z * (depth / 2 + WALL_GAP),
      }
      // Local +Z (the front) turns to (sin yaw, cos yaw); face it along the inward normal.
      const placed = placedAt(candidate, position, Math.atan2(inward.x, inward.z), y)
      if (fitsAt(room, placed)) return placed
    }
  }
  return null
}

/** Furniture with a top that small things can stand on. */
const SUPPORT_CATEGORIES = new Set(['nightstand', 'dresser', 'desk', 'table', 'coffee-table', 'storage'])

/** On top of a table, desk, dresser or nightstand, entirely on its surface. */
export function surfaceSpot(room: Room, candidate: RoomObject): RoomObject | null {
  const supports = room.objects.filter((object) => SUPPORT_CATEGORIES.has(object.category)).sort((a, b) => a.id.localeCompare(b.id))
  for (const support of supports) {
    const top = support.pose.position.y + support.dimensions.height
    const slack = (support.dimensions.width - candidate.dimensions.width) / 2
    if (slack < 0 || support.dimensions.depth < candidate.dimensions.depth) continue
    const surface = footprint(support)
    for (const offset of [0, slack * 0.6, -slack * 0.6]) {
      const position = toWorld(support.pose.position, support.pose.yaw, { x: offset, z: 0 })
      const placed = placedAt(candidate, position, support.pose.yaw, top)
      if (!footprint(placed).every((corner) => pointInPolygon(corner, surface))) continue
      if (fitsAt(room, placed)) return placed
    }
  }
  return null
}
