/**
 * Room zones → paint: which finishes each wall face and floor area gets.
 * Pure (no three.js) so it can be tested; Architecture.tsx applies it.
 */
import { pointInPolygon } from '../domain/geometry'
import type { Room, Vec2, Wall, Zone } from '../domain/schema'

/** How far off a wall's line to probe which side is which room (past the drawn thickness). */
const PROBE = 0.2

/** The zone a floor point lies in, or null for the room's own finishes. */
export function zoneAt(room: Pick<Room, 'zones'>, point: Vec2): Zone | null {
  return room.zones?.find((zone) => pointInPolygon(point, zone.polygon)) ?? null
}

export type FaceColors = {
  /** The face on the left of start → end (the wall's local +Z once drawn). */
  left: string
  /** The face on the right (local −Z). */
  right: string
}

/**
 * Wall paint per face: each face takes the wall color of the room it looks
 * into (its zone's, else the room's). An exterior wall's outside face matches
 * its inside face, so a building reads as one color from outside.
 */
export function wallFaceColors(room: Pick<Room, 'floorPolygon' | 'zones' | 'finishes'>, wall: Pick<Wall, 'start' | 'end'>): FaceColors {
  const dx = wall.end.x - wall.start.x
  const dz = wall.end.z - wall.start.z
  const length = Math.hypot(dx, dz) || 1
  const mid = { x: (wall.start.x + wall.end.x) / 2, z: (wall.start.z + wall.end.z) / 2 }
  const left = { x: mid.x - (dz / length) * PROBE, z: mid.z + (dx / length) * PROBE }
  const right = { x: mid.x + (dz / length) * PROBE, z: mid.z - (dx / length) * PROBE }
  const paint = (point: Vec2) => (pointInPolygon(point, room.floorPolygon) ? (zoneAt(room, point)?.finishes.wall ?? room.finishes.wall) : null)
  const leftColor = paint(left)
  const rightColor = paint(right)
  const fallback = leftColor ?? rightColor ?? room.finishes.wall
  return { left: leftColor ?? fallback, right: rightColor ?? fallback }
}
