/** Screen pointer → point on the floor plane (y = 0), for dragging and rotating objects. */
import { Plane, Raycaster, Vector2, Vector3, type Camera } from 'three'
import type { Vec2 } from '../domain/schema'

const raycaster = new Raycaster()
const floor = new Plane(new Vector3(0, 1, 0), 0)
const ndc = new Vector2()
const hit = new Vector3()

export function floorPoint(clientX: number, clientY: number, camera: Camera, element: HTMLElement): Vec2 | null {
  const rect = element.getBoundingClientRect()
  ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
  raycaster.setFromCamera(ndc, camera)
  return raycaster.ray.intersectPlane(floor, hit) ? { x: hit.x, z: hit.z } : null
}

/** Yaw-convention angle of a floor direction: 0 along +X, positive toward -Z (counter-clockwise from above). */
export function yawOf(dx: number, dz: number): number {
  return Math.atan2(-dz, dx)
}
