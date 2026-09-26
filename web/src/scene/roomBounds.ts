import { footprintBounds } from '../domain/geometry'
import type { Room } from '../domain/schema'

export type RoomSphere = { center: [number, number, number]; radius: number; height: number }

/** Bounding sphere of the room shell (floor outline × tallest wall). */
export function roomSphere(room: Room): RoomSphere {
  const bounds = footprintBounds(room.floorPolygon)
  const height = Math.max(2.4, ...room.walls.map((wall) => wall.height))
  const width = bounds.maxX - bounds.minX
  const depth = bounds.maxZ - bounds.minZ
  return {
    center: [(bounds.minX + bounds.maxX) / 2, height / 2, (bounds.minZ + bounds.maxZ) / 2],
    radius: Math.hypot(width / 2, depth / 2, height / 2),
    height,
  }
}
