/**
 * Placement helpers: find somewhere an item fits. Deterministic — the same room
 * and size always give the same answer.
 */
import { blocksFloor, footprintBounds, footprintsOverlap, insideRoom } from './geometry'
import type { Dimensions, Room, Vec2 } from './schema'
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
  const others = covering ? [] : room.objects.filter((object) => object.id !== options.ignoreId && blocksFloor(object))

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
