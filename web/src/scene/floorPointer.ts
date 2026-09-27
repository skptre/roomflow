/** Screen pointer → point on the floor plane (y = 0) or on a wall, for dragging and rotating objects. */
import { Plane, Raycaster, Vector2, Vector3, type Camera } from 'three'
import type { Vec2, Wall } from '../domain/schema'

const raycaster = new Raycaster()
const floor = new Plane(new Vector3(0, 1, 0), 0)
const wallPlane = new Plane()
const ndc = new Vector2()
const hit = new Vector3()

function aim(clientX: number, clientY: number, camera: Camera, element: HTMLElement) {
  const rect = element.getBoundingClientRect()
  ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
  raycaster.setFromCamera(ndc, camera)
}

export function floorPoint(clientX: number, clientY: number, camera: Camera, element: HTMLElement): Vec2 | null {
  aim(clientX, clientY, camera, element)
  return raycaster.ray.intersectPlane(floor, hit) ? { x: hit.x, z: hit.z } : null
}

/**
 * Screen pointer → point on a wall's vertical plane, as `along` (m from
 * `wall.start` toward `wall.end`) and `height` above the floor. Null when the
 * pointer ray runs parallel to the wall or away from it.
 */
export function wallPoint(clientX: number, clientY: number, camera: Camera, element: HTMLElement, wall: Pick<Wall, 'start' | 'end'>): { along: number; height: number } | null {
  const dx = wall.end.x - wall.start.x
  const dz = wall.end.z - wall.start.z
  const length = Math.hypot(dx, dz)
  if (length === 0) return null
  aim(clientX, clientY, camera, element)
  wallPlane.setFromNormalAndCoplanarPoint(new Vector3(-dz / length, 0, dx / length), new Vector3(wall.start.x, 0, wall.start.z))
  if (!raycaster.ray.intersectPlane(wallPlane, hit)) return null
  return { along: ((hit.x - wall.start.x) * dx + (hit.z - wall.start.z) * dz) / length, height: hit.y }
}

/** Yaw-convention angle of a floor direction: 0 along +X, positive toward -Z (counter-clockwise from above). */
export function yawOf(dx: number, dz: number): number {
  return Math.atan2(-dz, dx)
}
