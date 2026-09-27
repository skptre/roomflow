/**
 * Dollhouse cutaway: exterior walls between the camera and the room (and
 * partitions standing across the view) drop to a low stub
 * so the interior stays visible. Hysteresis keeps walls from
 * flickering while the camera orbits near the threshold.
 */
import { pointInPolygon } from '../domain/geometry'
import type { Vec2, Wall } from '../domain/schema'

/** A wall starts being cut when it faces the camera more than this… */
export const CUT_ON = 0.25
/** …and is restored only once it faces the camera less than this. */
export const CUT_OFF = 0.15

/** Unit normal of a wall pointing away from the floor (null for degenerate walls). */
export function outwardNormal(wall: Wall, floorPolygon: readonly Vec2[]): Vec2 | null {
  const dx = wall.end.x - wall.start.x
  const dz = wall.end.z - wall.start.z
  const length = Math.hypot(dx, dz)
  if (length === 0) return null
  const left = { x: -dz / length, z: dx / length }
  const mid = { x: (wall.start.x + wall.end.x) / 2, z: (wall.start.z + wall.end.z) / 2 }
  const probe = { x: mid.x + left.x * 0.05, z: mid.z + left.z * 0.05 }
  return pointInPolygon(probe, floorPolygon) ? { x: -left.x, z: -left.z } : left
}

/**
 * Which walls to cut for a camera. `cameraDir` is the horizontal part of the
 * unit vector from the orbit target to the camera (not renormalized, so a
 * steep top-down view cuts less). Exterior walls are cut when they face the
 * camera. An interior partition (floor on both sides, e.g. the wall between a
 * bedroom and its bathroom) is cut when either face looks at the camera: it
 * stands across the view and would hide one of the rooms. Partitions that run
 * along the view stay standing.
 */
export function wallsToCut(
  walls: readonly Wall[],
  floorPolygon: readonly Vec2[],
  cameraDir: Vec2,
  prevCut: ReadonlySet<string>,
): Set<string> {
  const cut = new Set<string>()
  for (const wall of walls) {
    const threshold = prevCut.has(wall.id) ? CUT_OFF : CUT_ON
    if (wall.exterior) {
      const normal = outwardNormal(wall, floorPolygon)
      if (!normal) continue
      const facing = normal.x * cameraDir.x + normal.z * cameraDir.z
      if (facing > threshold) cut.add(wall.id)
      continue
    }
    const dx = wall.end.x - wall.start.x
    const dz = wall.end.z - wall.start.z
    const length = Math.hypot(dx, dz)
    if (length === 0) continue
    // Either face may look at the camera; what matters is how squarely the partition crosses the view.
    const facing = Math.abs((-dz / length) * cameraDir.x + (dx / length) * cameraDir.z)
    if (facing > threshold) cut.add(wall.id)
  }
  return cut
}
