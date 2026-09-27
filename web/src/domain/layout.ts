/**
 * Placement helpers: find somewhere an item fits. Deterministic — the same room
 * and size always give the same answer.
 */
import { collisions } from './commands'
import { blocksFloor, clampIntoRoom, footprint, footprintBounds, footprintsOverlap, insideRoom, pointInPolygon } from './geometry'
import type { Dimensions, Room, RoomObject, Vec2, Wall } from './schema'
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
      const standing = { pose: placed.pose, dimensions: { width: size.width, depth: size.depth, height: size.height ?? Infinity } }
      if (!covering && blocksDoorway(room, standing)) continue
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

/** Inside the room, not colliding with anything (height-aware), and not blocking a doorway. */
export function fitsAt(room: Room, candidate: RoomObject): boolean {
  return insideRoom(candidate, room.floorPolygon) && collisions(room, candidate).length === 0 && !blocksDoorway(room, candidate)
}

/** Depth of floor kept clear in front of every door. */
const DOOR_CLEARANCE = 0.8
/** Things hung higher than this don't get in the way of walking through a door. */
const HEADROOM = 1.0

/**
 * Unit normal of a wall pointing into the room (toward the floor). Only the floor outline is read, so the
 * importer can call it before a Room exists. For an interior partition both sides are floor; the left side wins.
 */
export function inwardNormal(room: Pick<Room, 'floorPolygon'>, wall: Pick<Wall, 'start' | 'end'>): Vec2 {
  const dx = wall.end.x - wall.start.x
  const dz = wall.end.z - wall.start.z
  const length = Math.hypot(dx, dz) || 1
  const left = { x: -dz / length, z: dx / length }
  const mid = { x: wall.start.x + dx / 2, z: wall.start.z + dz / 2 }
  return pointInPolygon({ x: mid.x + left.x * 0.05, z: mid.z + left.z * 0.05 }, room.floorPolygon) ? left : { x: -left.x, z: -left.z }
}

/**
 * Would this item stand in a door's entry zone (the door's width, 80 cm into
 * the room)? Rugs and things hung above head height don't count.
 */
export function blocksDoorway(room: Room, candidate: { pose: Pose; dimensions: Pick<Dimensions, 'width' | 'height' | 'depth'> }): boolean {
  if (!blocksFloor(candidate) || candidate.pose.position.y >= HEADROOM) return false
  return room.openings.some((opening) => {
    if (opening.kind !== 'door') return false
    const wall = room.walls.find((w) => w.id === opening.wallId)
    if (!wall) return false
    const length = Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z) || 1
    const dir = { x: (wall.end.x - wall.start.x) / length, z: (wall.end.z - wall.start.z) / length }
    const inward = inwardNormal(room, wall)
    const center = {
      x: wall.start.x + dir.x * opening.offsetAlongWall + inward.x * (DOOR_CLEARANCE / 2),
      z: wall.start.z + dir.z * opening.offsetAlongWall + inward.z * (DOOR_CLEARANCE / 2),
    }
    const zone = {
      // Local +X along the wall: yaw turns +X to (cos, -sin).
      pose: { position: { x: center.x, y: 0, z: center.z }, yaw: Math.atan2(-dir.z, dir.x) },
      dimensions: { width: opening.width, depth: DOOR_CLEARANCE },
    }
    return footprintsOverlap(candidate, zone)
  })
}

/** The exterior wall an item's back rests against (e.g. hung art), or null. */
export function hostWall(room: Room, object: RoomObject): string | null {
  const back = toWorld(object.pose.position, object.pose.yaw, { x: 0, z: -object.dimensions.depth / 2 })
  for (const wall of room.walls) {
    if (!wall.exterior) continue
    const dx = wall.end.x - wall.start.x
    const dz = wall.end.z - wall.start.z
    const lengthSq = dx * dx + dz * dz || 1
    const t = Math.max(0, Math.min(1, ((back.x - wall.start.x) * dx + (back.z - wall.start.z) * dz) / lengthSq))
    if (Math.hypot(back.x - (wall.start.x + t * dx), back.z - (wall.start.z + t * dz)) < 0.03) return wall.id
  }
  return null
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
    const inward = inwardNormal(room, wall)
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

/** Where a hung item sits on its wall: the wall, its center along the wall (m from `wall.start`), and its bottom height. */
export type WallPlacement = { wall: Wall; along: number; bottom: number }

/** The host wall of a hung item and where on it the item sits, or null if it rests against no wall. */
export function wallPlacement(room: Room, object: RoomObject): WallPlacement | null {
  const id = hostWall(room, object)
  const wall = id ? room.walls.find((w) => w.id === id) : undefined
  if (!wall) return null
  const dx = wall.end.x - wall.start.x
  const dz = wall.end.z - wall.start.z
  const length = Math.hypot(dx, dz) || 1
  const along = ((object.pose.position.x - wall.start.x) * dx + (object.pose.position.z - wall.start.z) * dz) / length
  return { wall, along, bottom: object.pose.position.y }
}

/**
 * The item slid along its wall to a new center `along` and `bottom` height:
 * still against the same wall and facing the room, its size unchanged, kept
 * clear of the wall's ends, the floor and the ceiling line. Null if it hangs on no wall.
 */
export function slideOnWall(room: Room, object: RoomObject, along: number, bottom: number): RoomObject | null {
  const placement = wallPlacement(room, object)
  if (!placement) return null
  const { wall } = placement
  const { width, height, depth } = object.dimensions
  const length = Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z) || 1
  const dir = { x: (wall.end.x - wall.start.x) / length, z: (wall.end.z - wall.start.z) / length }
  const inward = inwardNormal(room, wall)
  const lo = width / 2 + WALL_MARGIN
  const hi = length - width / 2 - WALL_MARGIN
  const u = lo <= hi ? Math.min(hi, Math.max(lo, along)) : length / 2
  const y = Math.min(Math.max(0, wall.height - height - WALL_MARGIN), Math.max(0, bottom))
  const position = {
    x: wall.start.x + dir.x * u + inward.x * (depth / 2 + WALL_GAP),
    z: wall.start.z + dir.z * u + inward.z * (depth / 2 + WALL_GAP),
  }
  return placedAt(object, position, Math.atan2(inward.x, inward.z), y)
}

/** Would a hung item cover a door or window on its wall? */
export function coversOpening(room: Room, object: RoomObject): boolean {
  const placement = wallPlacement(room, object)
  if (!placement) return false
  const { wall, along, bottom } = placement
  const { width, height } = object.dimensions
  return room.openings.some(
    (opening) =>
      opening.wallId === wall.id &&
      Math.abs(along - opening.offsetAlongWall) < (opening.width + width) / 2 &&
      bottom < opening.bottom + opening.height &&
      opening.bottom < bottom + height,
  )
}

/** How far above a window's top a curtain rod goes, and how far the curtain hangs off the wall (clear of the frame). */
const ROD_ABOVE_WINDOW = 0.15
const CURTAIN_GAP = 0.03

/**
 * A curtain hung at a scanned window: centered on it, in front of the wall,
 * its top (the rod) a little above the window, falling toward the floor.
 * Widest windows first; a window that already has a curtain is skipped. The
 * curtain keeps its listed size (a different size is a different variant).
 */
export function windowSpot(room: Room, candidate: RoomObject): RoomObject | null {
  const { height, depth } = candidate.dimensions
  const windows = room.openings.filter((opening) => opening.kind === 'window').sort((a, b) => b.width - a.width || a.id.localeCompare(b.id))
  for (const opening of windows) {
    const wall = room.walls.find((w) => w.id === opening.wallId)
    if (!wall) continue
    const dx = wall.end.x - wall.start.x
    const dz = wall.end.z - wall.start.z
    const length = Math.hypot(dx, dz) || 1
    const dir = { x: dx / length, z: dz / length }
    const inward = inwardNormal(room, wall)
    const rod = Math.min(opening.bottom + opening.height + ROD_ABOVE_WINDOW, wall.height - 0.02)
    // A curtain longer than the rod is high rests on the floor instead.
    const y = Math.max(0, rod - height)
    if (y + height > wall.height) continue
    const center = {
      x: wall.start.x + dir.x * opening.offsetAlongWall,
      z: wall.start.z + dir.z * opening.offsetAlongWall,
    }
    const dressed = room.objects.some(
      (object) => object.category === 'curtain' && Math.hypot(object.pose.position.x - center.x, object.pose.position.z - center.z) < Math.max(opening.width / 2, 0.3),
    )
    if (dressed) continue
    const position = { x: center.x + inward.x * (depth / 2 + CURTAIN_GAP), z: center.z + inward.z * (depth / 2 + CURTAIN_GAP) }
    const placed = placedAt(candidate, position, Math.atan2(inward.x, inward.z), y)
    if (fitsAt(room, placed)) return placed
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

/** The piece a room is arranged around: bed, then sofa, then desk/table. */
export function anchorObject(room: Room): RoomObject | null {
  for (const category of ['bed', 'sofa', 'desk', 'table']) {
    const found = room.objects.find((object) => object.category === category)
    if (found) return found
  }
  return null
}

/** A rug under the anchor, shifted toward its front so it shows; otherwise the middle of the room. */
export function rugSpot(room: Room, candidate: RoomObject, anchor: RoomObject | null): RoomObject | null {
  if (anchor) {
    const center = toWorld(anchor.pose.position, anchor.pose.yaw, { x: 0, z: anchor.dimensions.depth * 0.25 })
    const placed = placedAt(candidate, center, anchor.pose.yaw, 0)
    const pose = clampIntoRoom(placed, room.floorPolygon)
    if (pose) return { ...placed, pose }
  }
  const pose = freeSpot(room, candidate.dimensions)
  return pose ? { ...candidate, pose } : null
}

/** Beside the anchor's head end (a lamp by the bed or desk), right side first; else the nearest free spot. */
export function besideSpot(room: Room, candidate: RoomObject, anchor: RoomObject | null): RoomObject | null {
  if (anchor) {
    const { width: aw, depth: ad } = anchor.dimensions
    const { width: w, depth: d } = candidate.dimensions
    for (const side of [1, -1]) {
      const local = { x: side * (aw / 2 + w / 2 + 0.08), z: -ad / 2 + d / 2 + 0.05 }
      const placed = placedAt(candidate, toWorld(anchor.pose.position, anchor.pose.yaw, local), anchor.pose.yaw, 0)
      if (fitsAt(room, placed)) return placed
    }
  }
  const pose = freeSpot(room, candidate.dimensions, { near: anchor ? anchor.pose.position : undefined })
  return pose ? { ...candidate, pose } : null
}

/** In the first free room corner (a plant), else anywhere free. */
export function cornerSpot(room: Room, candidate: RoomObject): RoomObject | null {
  const bounds = footprintBounds(room.floorPolygon)
  const inset = Math.max(candidate.dimensions.width, candidate.dimensions.depth) / 2 + 0.05
  const corners = [
    { x: bounds.minX + inset, z: bounds.minZ + inset },
    { x: bounds.maxX - inset, z: bounds.minZ + inset },
    { x: bounds.maxX - inset, z: bounds.maxZ - inset },
    { x: bounds.minX + inset, z: bounds.maxZ - inset },
  ]
  for (const corner of corners) {
    const pose = freeSpot(room, candidate.dimensions, { near: corner })
    if (pose && Math.hypot(pose.position.x - corner.x, pose.position.z - corner.z) < 0.6) return { ...candidate, pose }
  }
  const pose = freeSpot(room, candidate.dimensions)
  return pose ? { ...candidate, pose } : null
}

/** Distance from a point to the nearest edge of the floor outline. */
function distanceToOutline(point: Vec2, polygon: readonly Vec2[]): number {
  let best = Infinity
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!
    const b = polygon[(i + 1) % polygon.length]!
    const dx = b.x - a.x
    const dz = b.z - a.z
    const lengthSq = dx * dx + dz * dz || 1
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSq))
    best = Math.min(best, Math.hypot(point.x - (a.x + t * dx), point.z - (a.z + t * dz)))
  }
  return best
}

/**
 * On the wall behind the anchor, above it (art over the bed or desk) — only when
 * the anchor's back is against a wall, so art never floats mid-room.
 */
export function aboveSpot(room: Room, candidate: RoomObject, anchor: RoomObject | null, wallHeight: number): RoomObject | null {
  if (!anchor) return null
  const back = toWorld(anchor.pose.position, anchor.pose.yaw, { x: 0, z: -anchor.dimensions.depth / 2 })
  if (distanceToOutline(back, room.floorPolygon) > 0.1) return null
  const position = toWorld(anchor.pose.position, anchor.pose.yaw, { x: 0, z: -anchor.dimensions.depth / 2 + candidate.dimensions.depth / 2 + 0.002 })
  const y = Math.min(Math.max(1.2, anchor.dimensions.height + 0.25), wallHeight - candidate.dimensions.height - 0.1)
  if (y <= anchor.dimensions.height) return null
  const placed = placedAt(candidate, position, anchor.pose.yaw, y)
  return fitsAt(room, placed) ? placed : null
}
